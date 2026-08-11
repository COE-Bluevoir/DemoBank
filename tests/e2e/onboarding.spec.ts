import { expect, test } from "@playwright/test";

import {
  selectOrchestrationMode,
  selectScenario,
  unlockDemoControl,
} from "./demo-control";

test("happy-path onboarding can complete", async ({ page }) => {
  await unlockDemoControl(page);
  await selectOrchestrationMode(page, "mock-pega");
  await selectScenario(page, "HAPPY_PATH");

  await page.goto("/onboarding/start");
  await page.getByRole("button", { name: "Begin application" }).click();
  await page.getByLabel("First name").fill("Ananya");
  await page.getByLabel("Last name").fill("Rao");
  await page.getByLabel("Date of birth").fill("1992-08-14");
  await page.getByLabel("Nationality").fill("Indian");
  await page.getByLabel("Mobile number").fill("+91 90000 00000");
  await page.getByLabel("Email address").fill("ananya.rao@example.test");
  await page.getByLabel("Residential address").fill("18 Lake View Road");
  await page.getByLabel("City").fill("Hyderabad");
  await page.getByLabel("State or region").fill("Telangana");
  await page.getByLabel("Postal code").fill("500081");
  await page.getByLabel("Country").fill("India");
  await page.getByLabel("Employment status").selectOption("Salaried");
  await page.getByLabel("Income range").selectOption("INR 10-15 lakh per annum");
  await page.getByLabel("Tax residency").selectOption("India");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Use sample documents" }).click();
  await expect(
    page.getByRole("heading", { name: /Your account is open/i }),
  ).toBeVisible({
    timeout: 15000,
  });
});

test("address mismatch requires explicit confirmation", async ({ page }) => {
  await unlockDemoControl(page);
  await selectOrchestrationMode(page, "mock-pega");
  await selectScenario(page, "ADDRESS_PEP_REVIEW");
  await page.goto("/onboarding/start");
  await page.getByRole("button", { name: "Begin application" }).click();
  await page.getByLabel("First name").fill("Ananya");
  await page.getByLabel("Last name").fill("Rao");
  await page.getByLabel("Date of birth").fill("1992-08-14");
  await page.getByLabel("Nationality").fill("Indian");
  await page.getByLabel("Mobile number").fill("+91 90000 00000");
  await page.getByLabel("Email address").fill("ananya.rao@example.test");
  await page.getByLabel("Residential address").fill("18 Lake View Road");
  await page.getByLabel("City").fill("Hyderabad");
  await page.getByLabel("State or region").fill("Telangana");
  await page.getByLabel("Postal code").fill("500081");
  await page.getByLabel("Country").fill("India");
  await page.getByLabel("Employment status").selectOption("Salaried");
  await page.getByLabel("Income range").selectOption("INR 10-15 lakh per annum");
  await page.getByLabel("Tax residency").selectOption("India");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Use sample documents" }).click();
  await expect(page.getByText("Confirm your address")).toBeVisible({
    timeout: 10000,
  });
  await page.locator("button", { hasText: "Proof of address" }).click();
  await page.getByRole("button", { name: "Confirm selected address" }).click();
  await expect(
    page.getByRole("heading", { name: "Routine review" }),
  ).toBeVisible({ timeout: 10000 });
});

test("routine review can be cleared from demo control", async ({ page, context }) => {
  await unlockDemoControl(page);
  await selectOrchestrationMode(page, "mock-pega");
  await selectScenario(page, "ADDRESS_PEP_REVIEW");

  const customerPage = await context.newPage();
  await customerPage.goto("/onboarding/start");
  await customerPage.getByRole("button", { name: "Begin application" }).click();
  await customerPage.getByLabel("First name").fill("Ananya");
  await customerPage.getByLabel("Last name").fill("Rao");
  await customerPage.getByLabel("Date of birth").fill("1992-08-14");
  await customerPage.getByLabel("Nationality").fill("Indian");
  await customerPage.getByLabel("Mobile number").fill("+91 90000 00000");
  await customerPage.getByLabel("Email address").fill("ananya.rao@example.test");
  await customerPage.getByLabel("Residential address").fill("18 Lake View Road");
  await customerPage.getByLabel("City").fill("Hyderabad");
  await customerPage.getByLabel("State or region").fill("Telangana");
  await customerPage.getByLabel("Postal code").fill("500081");
  await customerPage.getByLabel("Country").fill("India");
  await customerPage.getByLabel("Employment status").selectOption("Salaried");
  await customerPage.getByLabel("Income range").selectOption("INR 10-15 lakh per annum");
  await customerPage.getByLabel("Tax residency").selectOption("India");
  await customerPage.getByRole("button", { name: "Save and continue" }).click();
  await customerPage.getByRole("checkbox").check();
  await customerPage.getByRole("button", { name: "Continue" }).click();
  await customerPage.getByRole("button", { name: "Use sample documents" }).click();
  await expect(customerPage.getByText("Confirm your address")).toBeVisible({ timeout: 10000 });
  await customerPage.locator("button", { hasText: "Proof of address" }).click();
  await customerPage.getByRole("button", { name: "Confirm selected address" }).click();
  await expect(
    customerPage.getByRole("heading", { name: "Routine review" }),
  ).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: "Clear review" }).click();
  await expect(
    customerPage.getByRole("heading", { name: /Your account is open/i }),
  ).toBeVisible({ timeout: 15000 });
});

test("refresh resumes the persisted case", async ({ page }) => {
  await page.goto("/onboarding/start");
  await page.getByRole("button", { name: "Begin application" }).click();
  await page.getByLabel("First name").fill("Ananya");
  await page.getByLabel("Last name").fill("Rao");
  await page.reload();
  await expect(page.getByText("Everyday Plus account application")).toBeVisible();
});

test("service timeout shows a customer-safe error", async ({ page }) => {
  await unlockDemoControl(page);
  await selectOrchestrationMode(page, "mock-pega");
  await selectScenario(page, "SERVICE_TIMEOUT");
  await page.goto("/onboarding/start");
  await page.getByRole("button", { name: "Begin application" }).click();
  await page.getByLabel("First name").fill("Ananya");
  await page.getByLabel("Last name").fill("Rao");
  await page.getByLabel("Date of birth").fill("1992-08-14");
  await page.getByLabel("Nationality").fill("Indian");
  await page.getByLabel("Mobile number").fill("+91 90000 00000");
  await page.getByLabel("Email address").fill("ananya.rao@example.test");
  await page.getByLabel("Residential address").fill("18 Lake View Road");
  await page.getByLabel("City").fill("Hyderabad");
  await page.getByLabel("State or region").fill("Telangana");
  await page.getByLabel("Postal code").fill("500081");
  await page.getByLabel("Country").fill("India");
  await page.getByLabel("Employment status").selectOption("Salaried");
  await page.getByLabel("Income range").selectOption("INR 10-15 lakh per annum");
  await page.getByLabel("Tax residency").selectOption("India");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Use sample documents" }).click();
  await expect(page.getByText("Verification saved for later")).toBeVisible({
    timeout: 15000,
  });
});

test("demo-control APIs reject unauthorised access", async ({ request }) => {
  const response = await request.post("/api/demo/mode", {
    data: { orchestrationMode: "mock-pega" },
  });
  expect(response.status()).toBe(401);
});
