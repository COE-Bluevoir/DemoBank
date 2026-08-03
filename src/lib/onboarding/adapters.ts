import { getServerConfig } from "@/lib/config/env";
import {
  createCaseRecord,
  fetchCaseEvents,
  fetchCaseView,
  getCaseMode,
  getDemoSettings,
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
import { PegaOrchestrationAdapter } from "@/lib/pega/adapter";

/**
 * Adapter selection.
 *
 * The route layer never knows which orchestration is active: it asks for an
 * adapter and receives something that satisfies the same interface. Swapping
 * `mock-pega` for `pega` therefore requires no change to routes, UI or the
 * normalized case model.
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
 * Standalone (non-Pega) comparison adapter.
 *
 * Still backed by the deterministic engine; it exists so the same journey can
 * be demonstrated without a governed orchestration layer behind it.
 */
export class StandaloneAgentOrchestrationAdapter extends MockDelegateAdapter {
  constructor() {
    super("non-pega");
  }
}

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
      return new StandaloneAgentOrchestrationAdapter();
  }
}

export function getAdapterForCase(caseId: string): OnboardingOrchestrationAdapter {
  // Read the same setting case creation used, so a mode switched at runtime
  // stays coherent across the rest of the journey. Live Pega cases have no
  // entry in the local store, so the case-scoped lookup must not run for them.
  const activeMode = getDemoSettings().orchestrationMode;

  if (activeMode === "pega") {
    return getAdapter("pega");
  }

  return getAdapter(getCaseMode(caseId));
}

/** True when `pega` mode can be selected in this environment. */
export function isPegaConnectionConfigured(): boolean {
  return Boolean(getServerConfig().pega);
}
