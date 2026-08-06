import { expect, test } from "@playwright/test";

import { sampleDocumentPdf } from "@/lib/pega/sample-documents";

import { unlockDemoControl } from "./demo-control";

/**
 * The complete customer journey on the AWS orchestration.
 *
 * This path does not depend on Pega being reachable or correctly configured,
 * so it must run to a finished account every time. It is driven entirely
 * through the UI — the switch, the forms, real file uploads — because that is
 * what a person actually does.
 */

const APPLICANT = {
  firstName: "Ananya",
  lastName: "Rao",
  dateOfBirth: "1992-08-14",
  nationality: "Indian",
  mobile: "+91 90000 00000",
  email: "ananya.rao@example.test",
  addressLine1: "18 Lake View Road",
  city: "Hyderabad",
  region: "Telangana",
  postalCode: "500081",
  country: "India",
  employmentStatus: "Salaried",
  incomeRange: "INR 10-15 lakh per annum",
  taxResidency: "India",
} as const;

test.setTimeout(180_000);

test("customer completes the journey on AWS without Pega", async ({ page }) => {
  let caseId = "";

  await test.step("choose AWS on the switch", async () => {
    await page.goto("/onboarding/start");

    const awsOption = page.getByRole("radio", { name: "AWS", exact: true });
    await expect(awsOption).toBeVisible({ timeout: 30_000 });
    await awsOption.check();
    await expect(awsOption).toBeChecked();

    await page.getByRole("button", { name: "Begin application" }).click();
  });

  await test.step("the case belongs to AWS, not Pega", async () => {
    // AWS mints NPG- references. Asserting the shape is what proves the switch
    // actually selected the backend rather than only changing a label.
    await expect(page.getByText(/NPG-[0-9A-F]+/)).toBeVisible({
      timeout: 60_000,
    });

    caseId = decodeURIComponent(new URL(page.url()).pathname.split("/").pop() ?? "");
    expect(caseId).toMatch(/^NPG-/);
    await expect(page.getByText("Running on")).toBeVisible();
    await expect(page.getByText("AWS", { exact: true }).first()).toBeVisible();
  });

  await test.step("complete every personal detail field", async () => {
    await expect(page.getByLabel("First name")).toBeVisible({ timeout: 30_000 });

    await page.getByLabel("First name").fill(APPLICANT.firstName);
    await page.getByLabel("Last name").fill(APPLICANT.lastName);
    await page.getByLabel("Date of birth").fill(APPLICANT.dateOfBirth);
    await page.getByLabel("Nationality").fill(APPLICANT.nationality);
    await page.getByLabel("Mobile number").fill(APPLICANT.mobile);
    await page.getByLabel("Email address").fill(APPLICANT.email);
    await page.getByLabel("Residential address").fill(APPLICANT.addressLine1);
    await page.getByLabel("City").fill(APPLICANT.city);
    await page.getByLabel("State or region").fill(APPLICANT.region);
    await page.getByLabel("Postal code").fill(APPLICANT.postalCode);
    await page.getByLabel("Country").fill(APPLICANT.country);
    await page
      .getByLabel("Employment status")
      .selectOption(APPLICANT.employmentStatus);
    await page.getByLabel("Income range").selectOption(APPLICANT.incomeRange);
    await page.getByLabel("Tax residency").selectOption(APPLICANT.taxResidency);

    await page.getByRole("button", { name: "Save and continue" }).click();
  });

  await test.step("accept the consent statement", async () => {
    const consent = page.getByRole("checkbox");
    await expect(consent).toBeVisible({ timeout: 30_000 });
    await consent.check();
    await page.getByRole("button", { name: "Continue" }).click();
  });

  await test.step("upload real identity and proof-of-address files", async () => {
    const fileInputs = page.locator('input[type="file"]');
    await expect(fileInputs.first()).toBeAttached({ timeout: 30_000 });

    await fileInputs.nth(0).setInputFiles({
      name: "Ananya_Rao_Identity.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(sampleDocumentPdf("IDENTITY")),
    });

    await expect(page.getByText("Ananya_Rao_Identity.pdf")).toBeVisible({
      timeout: 30_000,
    });

    await page
      .locator('input[type="file"]')
      .last()
      .setInputFiles({
        name: "Ananya_Rao_Utility_Bill.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(sampleDocumentPdf("ADDRESS")),
      });
  });

  await test.step("policy holds the case for a human", async () => {
    // The proof of address deliberately disagrees with the application, and
    // screening returns a possible PEP match. A deterministic policy engine —
    // not a model — decides that combination needs a person.
    await expect(
      page
        .getByRole("heading", { name: "Routine review" })
        .or(page.getByText(/under review|being reviewed/i))
        .first(),
    ).toBeVisible({ timeout: 120_000 });
  });

  await test.step("a reviewer clears the case", async () => {
    // Open the reviewer surface on this specific case rather than whichever
    // was most recently created, so the wrong review can never be cleared.
    await unlockDemoControl(page, caseId);

    // Confirm it really is showing the case this test opened.
    await expect(page.getByText(caseId).first()).toBeVisible({
      timeout: 30_000,
    });

    const cleared = page.waitForResponse(
      (response) =>
        response.url().includes("/clear-review") &&
        response.request().method() === "POST",
    );

    await page.getByRole("button", { name: /Clear review/i }).click();

    const response = await cleared;
    expect(response.ok(), await response.text()).toBe(true);
  });

  await test.step("the account is opened", async () => {
    await page.goto(`/onboarding/${encodeURIComponent(caseId)}`);

    await expect(
      page.getByRole("heading", { name: /Welcome to NorthStar Bank/i }),
    ).toBeVisible({ timeout: 60_000 });

    // A finished journey means a real customer and account reference, not
    // merely a screen that says "done".
    await expect(page.getByText(/CUST-\d+/)).toBeVisible();
    await expect(page.getByText(/ACC-\d+/)).toBeVisible();
  });

  await test.step("confirm no internal vocabulary reached the customer", async () => {
    const visible = await page.locator("body").innerText();

    expect(visible).not.toMatch(
      /\bPEP\b|sanction|HARD_STOP|MATERIAL|ASSIGN-WORKLIST|ODHMNT|Bearer /i,
    );
  });
});
