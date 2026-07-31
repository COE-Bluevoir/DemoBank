import {
  createCaseRecord,
  fetchCaseEvents,
  fetchCaseView,
  getCaseMode,
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

export class PegaOrchestrationAdapter extends MockDelegateAdapter {
  constructor() {
    super("pega");
  }
}

export class StandaloneAgentOrchestrationAdapter extends MockDelegateAdapter {
  constructor() {
    super("non-pega");
  }
}

export function getAdapter(mode: OrchestrationMode): OnboardingOrchestrationAdapter {
  switch (mode) {
    case "mock-pega":
      return new MockPegaOrchestrationAdapter();
    case "pega":
      return new PegaOrchestrationAdapter();
    case "non-pega":
      return new StandaloneAgentOrchestrationAdapter();
  }
}

export function getAdapterForCase(caseId: string) {
  return getAdapter(getCaseMode(caseId));
}
