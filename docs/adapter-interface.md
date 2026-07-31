# Adapter Interface

The website talks to an orchestration adapter through the following interface:

```ts
interface OnboardingOrchestrationAdapter {
  createCase(request: CreateOnboardingCaseRequest): Promise<CreateOnboardingCaseResponse>;
  getCase(caseId: string): Promise<OnboardingCaseView>;
  submitAction(caseId: string, request: SubmitCaseActionRequest): Promise<OnboardingCaseView>;
  uploadDocument(caseId: string, document: UploadedDocument): Promise<DocumentUploadResponse>;
  getMessages(caseId: string): Promise<AssistantMessage[]>;
  getEvents(caseId: string): Promise<DemoExecutionEvent[]>;
}
```

## Current implementations

- `MockPegaOrchestrationAdapter`
- `PegaOrchestrationAdapter`
- `StandaloneAgentOrchestrationAdapter`

`PegaOrchestrationAdapter` and `StandaloneAgentOrchestrationAdapter` are placeholders for future integration and currently delegate to the deterministic mock engine while preserving mode identity in the case model.
