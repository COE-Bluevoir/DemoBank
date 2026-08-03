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

Routes and UI components depend only on this interface and on the normalized
`OnboardingCaseView`. Switching orchestration requires no change to either.

## Implementations

| Class | Mode | Backing |
| --- | --- | --- |
| `MockPegaOrchestrationAdapter` | `mock-pega` | Deterministic in-process engine |
| `PegaOrchestrationAdapter` | `pega` | Live HTTP calls to Pega |
| `StandaloneAgentOrchestrationAdapter` | `non-pega` | Deterministic in-process engine |

`PegaOrchestrationAdapter` is a real integration client, not a placeholder. It
handles OAuth 2.0 client credentials, correlation and idempotency headers,
optimistic concurrency via `eTag`, bounded timeouts, retry with backoff on
transient failures, schema validation of every response, and translation of
Pega state into the normalized model.

See [pega-integration-guide.md](./pega-integration-guide.md) for the full
connection specification.

## Selection and failure behaviour

`getAdapter(mode)` resolves the implementation. Requesting `pega` in an
environment without a configured connection **throws**; it does not fall back
to the mock engine. The same rule applies at startup and when the demo control
panel attempts a mode switch, which returns `409` with a message naming the
missing settings.

This is deliberate: a silent fallback would make a broken integration
indistinguishable from a working one.

## Layers behind the adapter

| Module | Responsibility |
| --- | --- |
| `src/lib/config/env.ts` | Validated configuration; fails fast on misconfiguration |
| `src/lib/pega/token-provider.ts` | Token acquisition, caching, single-flight refresh |
| `src/lib/pega/http-client.ts` | Transport, retries, headers, response validation |
| `src/lib/pega/schemas.ts` | The contract Pega must satisfy |
| `src/lib/pega/mapper.ts` | Pega state → normalized customer-safe model |
| `src/lib/pega/errors.ts` | Upstream failure → neutral customer message |
| `src/lib/store/case-store.ts` | Persistence abstraction for mock modes |
| `src/lib/storage/document-storage.ts` | Uploaded document binaries |
