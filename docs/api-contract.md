# API Contract

## Customer journey APIs

- `POST /api/onboarding/cases`
- `GET /api/onboarding/cases/{caseId}`
- `POST /api/onboarding/cases/{caseId}/actions`
- `POST /api/onboarding/cases/{caseId}/documents`
- `GET /api/onboarding/cases/{caseId}/status`

## Demo control APIs

- `POST /api/demo/auth`
- `POST /api/demo/mode`
- `POST /api/demo/scenario`
- `POST /api/demo/cases/{caseId}/advance`
- `POST /api/demo/cases/{caseId}/reset`
- `POST /api/demo/cases/{caseId}/clear-review`
- `POST /api/demo/cases/{caseId}/force-timeout`

## Orchestration-facing APIs

Called by Pega, never by the browser. Authenticated with `x-service-api-key`
when `SERVICE_API_KEY` is configured.

- `GET /api/services` — tool allowlist and invocation contract
- `POST /api/services/{tool}` — invoke an approved tool
- `GET /api/internal/documents/{storageReference}` — retrieve document content
- `HEAD /api/internal/documents/{storageReference}` — document metadata only

## Operations APIs

- `GET /api/health` — configuration and readiness
- `GET /api/health?deep=true` — additionally verifies Pega authentication

## Notes

- All customer-facing pages talk through the backend-for-frontend API surface.
- Demo-control APIs require the passcode cookie and return `401` when unauthorised.
- The API returns a normalised `OnboardingCaseView` that is intentionally independent from Pega.
- Switching to `pega` mode without a configured connection returns `409` rather
  than silently using the mock engine.
- Document uploads are size-checked before buffering and content-sniffed; the
  declared MIME type is not trusted.

See [pega-integration-guide.md](./pega-integration-guide.md) for full request
and response shapes.
