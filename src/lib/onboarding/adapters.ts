import { getServerConfig } from "@/lib/config/env";
import {
  clearReview,
  createCaseRecord,
  fetchCaseEvents,
  fetchCaseView,
  saveDocument,
  submitCaseAction,
} from "@/lib/onboarding/engine";
import type {
  AssistantMessage,
  CreateOnboardingCaseRequest,
  CreateOnboardingCaseResponse,
  DemoExecutionEvent,
  DocumentUploadResponse,
  OnboardingCaseView,
  OnboardingOrchestrationAdapter,
  OrchestrationMode,
  SubmitCaseActionRequest,
  UploadedDocument,
} from "@/lib/onboarding/types";
import { NonPegaOrchestrationAdapter } from "@/lib/orchestration/non-pega-adapter";
import { PegaOrchestrationAdapter } from "@/lib/pega/adapter";

/**
 * Adapter selection.
 *
 * The route layer never knows which orchestration is active: it asks for an
 * adapter and receives something that satisfies the same interface.
 *
 * The modes are mutually exclusive, and deliberately so:
 *
 *   pega      Pega is the complete orchestration authority. This application
 *             is only an experience and API adapter; no model participates in
 *             the business workflow.
 *   non-pega  The complete alternative, implemented outside Pega. Case state,
 *             policy, exceptions, review gating, tool execution and
 *             activation all live here, and Pega is never called.
 *   mock-pega A deterministic stand-in for the Pega path, for local work.
 *
 * Comparing them is only meaningful because neither borrows from the other.
 */

/** Deterministic in-process orchestration used for local development and demos. */
class MockDelegateAdapter implements OnboardingOrchestrationAdapter {
  constructor(private readonly mode: OrchestrationMode) {}

  async createCase(
    request: CreateOnboardingCaseRequest,
  ): Promise<CreateOnboardingCaseResponse> {
    return createCaseRecord(request, this.mode);
  }

  async getCase(caseId: string): Promise<OnboardingCaseView> {
    return fetchCaseView(caseId);
  }

  async submitAction(
    caseId: string,
    request: SubmitCaseActionRequest,
  ): Promise<OnboardingCaseView> {
    // Clearing a review is a reviewer's decision rather than a step in the
    // customer's flow, but every orchestration must expose it the same way so
    // the operations surface does not need to know which one is running.
    if (request.actionId === "CLEAR_REVIEW") {
      return clearReview(caseId);
    }

    return submitCaseAction(caseId, request);
  }

  async uploadDocument(
    caseId: string,
    document: UploadedDocument,
  ): Promise<DocumentUploadResponse> {
    return saveDocument(caseId, document);
  }

  async getMessages(caseId: string): Promise<AssistantMessage[]> {
    return (await this.getCase(caseId)).assistantMessages;
  }

  async getEvents(caseId: string): Promise<DemoExecutionEvent[]> {
    return fetchCaseEvents(caseId);
  }
}

export class MockPegaOrchestrationAdapter extends MockDelegateAdapter {
  constructor() {
    super("mock-pega");
  }
}

/**
 * Non-Pega orchestration.
 *
 * A complete alternative implementation: it owns case state, lifecycle,
 * policy, exceptions, human-review gating, tool execution and activation.
 * Pega is never called in this mode.
 */
export { NonPegaOrchestrationAdapter } from "@/lib/orchestration/non-pega-adapter";

export { PegaOrchestrationAdapter } from "@/lib/pega/adapter";

export function getAdapter(mode: OrchestrationMode): OnboardingOrchestrationAdapter {
  switch (mode) {
    case "mock-pega":
      return new MockPegaOrchestrationAdapter();
    case "pega":
      // Throws a ConfigurationError when the connection is not configured.
      // Falling back to the mock here would make a broken integration look
      // like a working one, which is the failure mode this design forbids.
      return new PegaOrchestrationAdapter();
    case "non-pega":
      return new NonPegaOrchestrationAdapter();
  }
}

/**
 * Which orchestration owns a case, decided by the case itself.
 *
 * Each orchestration mints its own identifiers, so the reference a customer
 * already holds says who owns it. Reading the current setting instead would
 * mean a switch flipped mid-journey sent the rest of an application to a
 * system that has never heard of it.
 */
export function resolveCaseMode(caseId: string): OrchestrationMode {
  if (caseId.startsWith("NPG-")) {
    return "non-pega";
  }

  if (caseId.startsWith("ONB-")) {
    return "mock-pega";
  }

  // Pega's IDs carry its work-class prefix and are not otherwise predictable,
  // so anything unrecognised belongs to Pega.
  return "pega";
}

export function getAdapterForCase(caseId: string): OnboardingOrchestrationAdapter {
  return getAdapter(resolveCaseMode(caseId));
}

/** True when `pega` mode can be selected in this environment. */
export function isPegaConnectionConfigured(): boolean {
  return Boolean(getServerConfig().pega);
}
