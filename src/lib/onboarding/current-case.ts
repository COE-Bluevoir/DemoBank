import { getAdapterForCase } from "@/lib/onboarding/adapters";
import { getCurrentCaseId } from "@/lib/onboarding/engine";
import { logServerError } from "@/lib/observability/logger";
import type {
  DemoExecutionEvent,
  OnboardingCaseView,
} from "@/lib/onboarding/types";

/**
 * The case the operations surface is currently showing.
 *
 * Resolved through whichever orchestration owns it. Reading the mock engine
 * directly would throw for a Pega or AWS case, which is how a reviewer ends up
 * unable to act on the application a customer just opened.
 */
export async function loadCurrentCase(requestedCaseId?: string): Promise<{
  caseView: OnboardingCaseView | null;
  events: DemoExecutionEvent[];
}> {
  // An explicit case wins: a reviewer following a link to one application
  // should see that application, not whichever was opened most recently.
  const caseId = requestedCaseId ?? getCurrentCaseId();

  if (!caseId) {
    return { caseView: null, events: [] };
  }

  try {
    const adapter = getAdapterForCase(caseId);

    return {
      caseView: await adapter.getCase(caseId),
      events: await adapter.getEvents(caseId),
    };
  } catch (error) {
    // A case can become unreadable — after a reset, or when the orchestration
    // that owns it is unreachable. The rest of the panel still works without
    // it, so this is reported rather than fatal.
    logServerError({ scope: "demo-control", caseId }, error);
    return { caseView: null, events: [] };
  }
}
