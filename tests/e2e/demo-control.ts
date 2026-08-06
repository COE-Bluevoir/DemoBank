import { expect, type Page } from "@playwright/test";

/**
 * Helpers for driving the presenter control panel from a test.
 *
 * Demo settings are server-side and persist between runs, so a test that does
 * not establish the mode it needs inherits whatever ran last — which is how a
 * live-Pega test ends up quietly passing against the mock, and vice versa.
 *
 * Selecting an option posts the change in the background. Navigating before
 * that request lands starts the journey under the previous setting, so each
 * helper waits for the server to acknowledge before returning.
 */

export async function unlockDemoControl(
  page: Page,
  caseId?: string,
): Promise<void> {
  const target = caseId
    ? `/demo/control?caseId=${encodeURIComponent(caseId)}`
    : "/demo/control";

  await page.goto(target);
  await page.getByLabel("Passcode").fill("northstar-26");

  // The cookie is set by the response, so navigating before it lands would
  // simply render the passcode form again.
  const authorized = page.waitForResponse(
    (response) =>
      response.url().includes("/api/demo/auth") &&
      response.request().method() === "POST",
  );

  await page.getByRole("button", { name: "Unlock demo control" }).click();
  await authorized;

  // Unlocking re-renders the panel; without the query string the reviewer
  // would land back on whichever case was most recently opened.
  if (caseId) {
    await page.goto(target);
  }

  await expect(page.getByLabel("Passcode")).toHaveCount(0);
}

async function selectAndAwait(
  page: Page,
  label: string,
  value: string,
  endpoint: string,
): Promise<void> {
  const committed = page.waitForResponse(
    (response) =>
      response.url().includes(endpoint) && response.request().method() === "POST",
  );

  await page.getByLabel(label).selectOption(value);
  await committed;
}

export async function selectOrchestrationMode(
  page: Page,
  mode: "mock-pega" | "pega" | "non-pega",
): Promise<void> {
  await selectAndAwait(page, "Orchestration mode", mode, "/api/demo/mode");

  // Confirm against the server rather than trusting the control. Which
  // orchestration runs is the one thing every one of these tests depends on,
  // and getting it silently wrong makes the whole run meaningless.
  await expect
    .poll(
      async () => {
        const response = await page.request.get("/api/health");
        return (await response.json()).orchestrationMode;
      },
      { timeout: 15_000 },
    )
    .toBe(mode);
}

export async function selectScenario(
  page: Page,
  scenarioId: "ADDRESS_PEP_REVIEW" | "HAPPY_PATH" | "SERVICE_TIMEOUT",
): Promise<void> {
  await selectAndAwait(page, "Scenario", scenarioId, "/api/demo/scenario");
}
