import { test } from "@playwright/test";

test("capture key screens", async ({ page }) => {
  await page.goto("/");
  await page.screenshot({ path: "docs/screenshots-home.png", fullPage: true });
  await page.goto("/accounts/everyday-plus");
  await page.screenshot({ path: "docs/screenshots-product.png", fullPage: true });
  await page.goto("/onboarding/start");
  await page.screenshot({ path: "docs/screenshots-start.png", fullPage: true });
});
