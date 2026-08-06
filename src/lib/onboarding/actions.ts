/**
 * Actions a customer may never submit for themselves.
 *
 * The human-review gate is the control that holds an application when policy
 * says a person must look at it. The customer-facing API and the reviewer API
 * both reach the same adapter, so without this the applicant could clear their
 * own review by calling the public endpoint directly — and the gate would be
 * decorative.
 *
 * Reviewer actions are accepted only on the authenticated operations route.
 */
export const REVIEWER_ONLY_ACTIONS: ReadonlySet<string> = new Set([
  "CLEAR_REVIEW",
]);

export function isReviewerOnlyAction(actionId: string): boolean {
  return REVIEWER_ONLY_ACTIONS.has(actionId.toUpperCase());
}
