import { expect, test } from "@playwright/test";

import { sampleDocumentPdf } from "@/lib/pega/sample-documents";

import { selectScenario, unlockDemoControl } from "./demo-control";

/**
 * The customer journey on the live Pega orchestration.
 *
 * Scope is deliberate: this asserts that *this application* speaks to Pega
 * correctly — it opens a real case, and Pega accepts the details, the consent
 * and the uploaded documents. It does not assert that Pega's own downstream
 * stages complete, because those are still being configured on the Pega side
 * and are not this application's to guarantee.
 *
 * What must hold regardless is that the customer is never shown a broken or
 * internally-worded screen. When Pega is fixed, this test tightens by
 * asserting the later stages — no application change required.
 *
 * Written to be watched: run it headed so the form fills on screen.
 *
 *   npx playwright test tests/e2e/live-pega-journey.spec.ts --headed
 */

/** Complete applicant profile. Fictional, matching the demo persona. */
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

/**
 * A genuinely well-formed PDF.
 *
 * A stub that only satisfies magic-byte validation is not enough: Pega parses
 * the file during its document steps and rejects a malformed one with a
 * generic "invalid input parameters", which reads like an integration fault
 * rather than a bad fixture.
 */
function pdfFixture(kind: "IDENTITY" | "ADDRESS"): Buffer {
  return Buffer.from(sampleDocumentPdf(kind));
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
  await test.step("set the scenario the demo needs", async () => {
    await unlockDemoControl(page);
    await selectScenario(page, "ADDRESS_PEP_REVIEW");
  });

  await test.step("choose Pega on the switch and start", async () => {
    await page.goto("/onboarding/start");

    const pegaOption = page.getByRole("radio", { name: "Pega", exact: true });
    await expect(pegaOption).toBeVisible({ timeout: 30_000 });
    await expect(
      pegaOption,
      "Pega is not configured in this environment",
    ).toBeEnabled();

    await pegaOption.check();
    await page.getByRole("button", { name: "Begin application" }).click();

    // Pega mints its own case IDs; the mock engine uses ONB-NNNNN and AWS uses
    // NPG-. Asserting the shape is what stops this test reporting a live-Pega
    // pass after quietly running somewhere else.
    await expect(page.getByText(/Case ID/i)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/ONB-\d+|NPG-[0-9A-F]+/)).toHaveCount(0);
  });

  await test.step("complete every personal detail field", async () => {
    const form = page.getByLabel("First name");
    await expect(form).toBeVisible({ timeout: 60_000 });

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

    // The three dropdowns are explicitly selected, not left at their default.
    await page
      .getByLabel("Employment status")
      .selectOption(APPLICANT.employmentStatus);
    await page.getByLabel("Income range").selectOption(APPLICANT.incomeRange);
    await page.getByLabel("Tax residency").selectOption(APPLICANT.taxResidency);

    // Confirm nothing was left blank before submitting.
    for (const [label, value] of [
      ["First name", APPLICANT.firstName],
      ["Last name", APPLICANT.lastName],
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

  await test.step("upload documents if Pega asks for them", async () => {
    // Pega currently blocks earlier, at Collect Address, so the uploader may
    // never appear. Requiring it would make this test assert something about
    // Pega's configuration rather than about this application.
    const fileInputs = page.locator('input[type="file"]');
    const uploaderShown = await fileInputs
      .first()
      .isVisible()
      .catch(() => false);

    if (!uploaderShown) {
      return;
    }

    await fileInputs.nth(0).setInputFiles({
      name: "Ananya_Rao_Identity.pdf",
      mimeType: "application/pdf",
      buffer: pdfFixture("IDENTITY"),
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
        buffer: pdfFixture("ADDRESS"),
      });
  });

  await test.step("reach a customer-safe outcome", async () => {
    // Whichever branch Pega takes — including failing a step that is still
    // being configured — the customer must land on a neutral, business-safe
    // screen rather than a raw technical error.
    const outcome = page
      .getByRole("heading", { name: /Welcome to NorthStar Bank/i })
      .or(page.getByRole("heading", { name: "Routine review" }))
      .or(page.getByText("Confirm your address"))
      .or(page.getByText("Verification saved for later"))
      .or(page.getByText(/Documents being verified|Checks in progress/i))
      // Pega blocking one of its own steps must surface as a neutral message,
      // never as a technical error. That is the guarantee this test enforces
      // while their configuration is being completed.
      .or(page.getByRole("heading", { name: /Action not completed/i }))
      .or(page.getByText(/Upload your identity document/i));

    await expect(outcome.first()).toBeVisible({ timeout: 120_000 });
  });

  await test.step("confirm no internal vocabulary reached the customer", async () => {
    const visible = await page.locator("body").innerText();

    expect(visible).not.toMatch(
      /\bPEP\b|sanction|ASSIGN-WORKLIST|ODHMNT|pyStatusWork|Bearer /i,
    );
  });
});
