import { expect, test } from "@playwright/test";

/**
 * Full customer journey against whichever orchestration is configured.
 *
 * Written to be watched: run it headed so the form fills on screen.
 *
 *   npx playwright test tests/e2e/live-pega-journey.spec.ts --headed
 *
 * Every field the UI exposes is completed — including the three dropdowns and
 * the consent checkbox — rather than only the minimum needed to advance.
 */

/** Complete applicant profile. Fictional, matching the demo persona. */
const APPLICANT = {
  fullName: "Ananya Rao",
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

/** A small but structurally valid PDF, so magic-byte validation passes. */
function pdfFixture(description: string): Buffer {
  return Buffer.from(
    [
      "%PDF-1.7",
      "1 0 obj<</Type/Catalog>>endobj",
      `% ${description} - fictional test document`,
      "trailer<</Root 1 0 R>>",
      "%%EOF",
    ].join("\n"),
    "utf8",
  );
}

// Live Pega round trips are slower than the in-process mock.
test.setTimeout(240_000);

test.use({
  viewport: { width: 1440, height: 960 },
  // Visible pacing so a human can follow along in headed mode.
  launchOptions: { slowMo: 350 },
});

test("customer completes the Everyday Plus journey with every field filled", async ({
  page,
}) => {
  await test.step("open the bank site and start an application", async () => {
    await page.goto("/onboarding/start");
    await expect(
      page.getByRole("button", { name: "Begin application" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Begin application" }).click();
  });

  await test.step("complete every personal detail field", async () => {
    const form = page.getByLabel("Full legal name");
    await expect(form).toBeVisible({ timeout: 60_000 });

    await page.getByLabel("Full legal name").fill(APPLICANT.fullName);
    await page.getByLabel("Date of birth").fill(APPLICANT.dateOfBirth);
    await page.getByLabel("Nationality").fill(APPLICANT.nationality);
    await page.getByLabel("Mobile number").fill(APPLICANT.mobile);
    await page.getByLabel("Email address").fill(APPLICANT.email);
    await page.getByLabel("Residential address").fill(APPLICANT.addressLine1);
    await page.getByLabel("City").fill(APPLICANT.city);
    await page.getByLabel("State or region").fill(APPLICANT.region);
    await page.getByLabel("Postal code").fill(APPLICANT.postalCode);
    await page.getByLabel("Country").fill(APPLICANT.country);

    // The three dropdowns are explicitly selected, not left at their default.
    await page
      .getByLabel("Employment status")
      .selectOption(APPLICANT.employmentStatus);
    await page.getByLabel("Income range").selectOption(APPLICANT.incomeRange);
    await page.getByLabel("Tax residency").selectOption(APPLICANT.taxResidency);

    // Confirm nothing was left blank before submitting.
    for (const [label, value] of [
      ["Full legal name", APPLICANT.fullName],
      ["Nationality", APPLICANT.nationality],
      ["Employment status", APPLICANT.employmentStatus],
      ["Income range", APPLICANT.incomeRange],
      ["Tax residency", APPLICANT.taxResidency],
    ] as const) {
      await expect(page.getByLabel(label)).toHaveValue(value);
    }

    await page.getByRole("button", { name: "Save and continue" }).click();
  });

  await test.step("accept the consent statement", async () => {
    const consent = page.getByRole("checkbox");
    await expect(consent).toBeVisible({ timeout: 60_000 });
    await expect(consent).not.toBeChecked();

    await consent.check();
    await expect(consent).toBeChecked();

    await page.getByRole("button", { name: "Continue" }).click();
  });

  await test.step("upload real identity and proof-of-address files", async () => {
    const fileInputs = page.locator('input[type="file"]');
    await expect(fileInputs.first()).toBeAttached({ timeout: 60_000 });

    // Genuine file uploads, not the presenter shortcut: these bytes must reach
    // the orchestration layer as real attachments.
    await fileInputs.nth(0).setInputFiles({
      name: "Ananya_Rao_Identity.pdf",
      mimeType: "application/pdf",
      buffer: pdfFixture("Identity document for Ananya Rao"),
    });

    await expect(page.getByText("Ananya_Rao_Identity.pdf")).toBeVisible({
      timeout: 60_000,
    });

    await page
      .locator('input[type="file"]')
      .last()
      .setInputFiles({
        name: "Ananya_Rao_Utility_Bill.pdf",
        mimeType: "application/pdf",
        buffer: pdfFixture("Utility bill for 18 Lake View Road"),
      });

    await expect(page.getByText("Ananya_Rao_Utility_Bill.pdf")).toBeVisible({
      timeout: 60_000,
    });
  });

  await test.step("reach a customer-safe outcome", async () => {
    // Whichever branch the orchestration takes, the customer must land on a
    // neutral, business-safe screen — never a raw technical error.
    const outcome = page
      .getByRole("heading", { name: /Welcome to NorthStar Bank/i })
      .or(page.getByRole("heading", { name: "Routine review" }))
      .or(page.getByText("Confirm your address"))
      .or(page.getByText("Verification saved for later"))
      .or(page.getByText(/Documents being verified|Checks in progress/i));

    await expect(outcome.first()).toBeVisible({ timeout: 120_000 });
  });

  await test.step("confirm no internal vocabulary reached the customer", async () => {
    const visible = await page.locator("body").innerText();

    expect(visible).not.toMatch(
      /\bPEP\b|sanction|ASSIGN-WORKLIST|ODHMNT|pyStatusWork|Bearer /i,
    );
  });
});
