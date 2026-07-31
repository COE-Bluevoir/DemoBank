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

## Notes

- All customer-facing pages talk through the backend-for-frontend API surface.
- Demo-control APIs require the passcode cookie and return `401` when unauthorised.
- The API returns a normalised `OnboardingCaseView` that is intentionally independent from Pega.
