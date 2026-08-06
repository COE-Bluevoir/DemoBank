// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isReviewerOnlyAction } from "@/lib/onboarding/actions";

/**
 * The human-review gate is the control that holds an application when policy
 * says a person must look at it. Customer and reviewer requests reach the same
 * adapter, so the gate is only real if the customer-facing route refuses
 * reviewer actions.
 */

describe("reviewer-only actions", () => {
  it("refuses a customer clearing their own review", () => {
    expect(isReviewerOnlyAction("CLEAR_REVIEW")).toBe(true);
  });

  it("is not defeated by casing", () => {
    expect(isReviewerOnlyAction("clear_review")).toBe(true);
    expect(isReviewerOnlyAction("Clear_Review")).toBe(true);
  });

  it("leaves the customer's own steps alone", () => {
    for (const action of [
      "BEGIN_APPLICATION",
      "SUBMIT_DETAILS",
      "ACCEPT_CONSENT",
      "USE_DEMO_DOCUMENTS",
      "CONFIRM_ADDRESS",
      "CHECK_STATUS",
    ]) {
      expect(isReviewerOnlyAction(action)).toBe(false);
    }
  });
});
