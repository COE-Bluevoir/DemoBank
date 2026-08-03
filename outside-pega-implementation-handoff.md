# Outside Pega Implementation Handoff

## Purpose

This document defines the scope for the team building everything outside Pega:

- the public bank website
- the onboarding experience
- the backend-for-frontend layer
- the adapter boundary that will later connect to Pega
- mock services and local development tooling

The goal is to produce a customer-facing experience that feels like a real bank website while remaining Pega-independent at the UI layer.

## Target Outcome

The external application must:

- look and behave like a credible retail bank website
- support the full Everyday Plus account-opening journey
- communicate only with the bank experience API / BFF
- never call Pega directly from the browser
- render only customer-safe content
- preserve orchestration-mode switching without frontend rewrites

## Ownership Boundary

This team owns:

- all customer-facing pages
- all frontend components
- the normalized case model consumed by the frontend
- the BFF APIs exposed to the frontend
- the adapter interfaces for orchestration
- local/session persistence behavior
- hidden presenter and demo-control screens
- mock service implementations used before live Pega integration
- test automation for website and BFF behavior

This team does not own:

- Pega case type configuration
- Pega flows, stages, routing, assignment logic
- Pega-integrated agent/tool execution
- real compliance/screening provider integration
- real bank core customer/account creation

## Architecture

### Required runtime shape

Customer Browser
→ Public NorthStar Bank website
→ Backend-for-Frontend API
→ Orchestration Adapter
→ Mock Pega Adapter now
→ Real Pega Adapter later

### Non-negotiable rules

- Browser never calls Pega APIs directly.
- Browser only consumes normalized website-facing models.
- Internal screening terms must not leak into customer UI.
- The adapter layer must isolate the frontend from Pega-specific payloads.

## Customer-Facing Product Scope

### Public routes

Implement and maintain:

- `/`
- `/accounts/everyday-plus`
- `/onboarding/start`
- `/onboarding/[caseId]`
- `/onboarding/[caseId]/status`

Internal-only route:

- `/demo/control`

### Customer experience rules

- The website must read like a real bank website, not a demo microsite.
- Product and support language should be simple, calm, and professional.
- Avoid technical language such as:
  - `Pega`
  - `agent`
  - `tool`
  - `MCP`
  - `screen_pep`
  - `confidence 62%`
  - `sanctions`
  - `provider reference`
- Customer statuses should remain neutral and business-safe:
  - `Application started`
  - `Information required`
  - `Documents being verified`
  - `Checks in progress`
  - `Routine review`
  - `Account being created`
  - `Onboarding complete`
  - `Unable to continue`

## Functional Scope

### 1. Public bank website

Build:

- a polished homepage
- product-details page for Everyday Plus Account
- product CTA flows into onboarding
- support/trust sections
- non-functional sign-in CTA is acceptable

Acceptance criteria:

- page feels like a real retail banking website
- no visible prototype or leadership-demo copy
- responsive desktop and mobile behavior

### 2. Onboarding start

Build:

- account opening entry page
- product-intent guidance
- start action that creates a case in the BFF
- immediate transition to the first structured form step

Acceptance criteria:

- start action creates a backend case
- case ID is preserved
- user lands on details stage without manual refresh

### 3. Applicant details step

Capture:

- full legal name
- date of birth
- nationality
- tax residency
- mobile
- email
- residential address
- employment status
- income range

Requirements:

- client-side validation
- server-side validation through BFF
- clean error states
- ability to re-fetch state after refresh

### 4. Consent step

Requirements:

- short customer-safe consent statement
- checkbox acceptance
- disabled continue button until acceptance
- consent timestamp, version, and channel passed to BFF

### 5. Document upload step

Support:

- identity document
- proof-of-address document
- PDF/JPG/PNG only
- size validation
- upload progress
- remove/re-upload
- sample-document path for local demo flow

Requirements:

- uploaded files treated as untrusted
- document metadata sent to BFF
- document contents never logged in plaintext

### 6. Verification progress step

Display:

- staged progress UI
- backend-driven progression
- subtle motion only
- reduced-motion support

Do not display:

- raw tool names
- internal provider names
- internal confidence values

### 7. Address mismatch handling

Build:

- comparison view showing entered address vs document address
- explicit customer selection
- explicit confirmation action

Requirements:

- never overwrite address silently
- routing must continue through the BFF action API

### 8. Routine review step

Display:

- neutral review message
- case reference
- current status
- last updated time
- status refresh action

Do not display:

- PEP
- sanctions
- match confidence
- internal notes
- evidence references

### 9. Completion step

Display:

- success message
- customer reference
- account reference
- product name
- completion time
- digital banking CTA
- return home CTA

## Backend-for-Frontend Scope

### Required API surface

Maintain these APIs:

- `POST /api/onboarding/cases`
- `GET /api/onboarding/cases/{caseId}`
- `POST /api/onboarding/cases/{caseId}/actions`
- `POST /api/onboarding/cases/{caseId}/documents`
- `GET /api/onboarding/cases/{caseId}/status`

Internal/demo APIs:

- `POST /api/demo/auth`
- `GET /api/demo/current`
- `POST /api/demo/mode`
- `POST /api/demo/scenario`
- `POST /api/demo/cases/{caseId}/advance`
- `POST /api/demo/cases/{caseId}/reset`
- `POST /api/demo/cases/{caseId}/clear-review`
- `POST /api/demo/cases/{caseId}/force-timeout`

### BFF responsibilities

- normalize orchestration responses into website-facing models
- map statuses to customer-safe states
- validate action payloads
- validate file type and size
- preserve case version for optimistic concurrency
- preserve correlation ID
- expose assistant messages as server-provided content
- block access to demo APIs when disabled or unauthorized

## Normalized Data Contract

The frontend must consume the normalized case model only.

Core model requirements:

- `caseId`
- `caseVersion`
- `correlationId`
- `orchestrationMode`
- `scenarioId`
- `status`
- `customerSafeStatus`
- `progress`
- `applicant`
- `documents`
- `assistantMessages`
- `lastUpdatedAt`
- `outcome`

The external team must not embed Pega case structures directly into UI components.

## Adapter Layer Scope

Implement and maintain:

- `OnboardingOrchestrationAdapter`
- `MockPegaOrchestrationAdapter`
- `PegaOrchestrationAdapter` placeholder
- `StandaloneAgentOrchestrationAdapter` placeholder

### Current responsibility

The mock adapter must:

- run deterministic state transitions
- support the scripted review scenario
- support happy path
- support service timeout
- emit neutral execution events

### Future readiness

The Pega adapter must be pluggable later without changing:

- route structure
- UI flows
- frontend case model
- assistant rendering
- progress rendering

## Mock Services Scope

Build deterministic mock tool/service behavior for:

- identity extraction
- address extraction
- identity verification
- address validation
- sanctions screening
- PEP screening
- duplicate check
- customer creation
- communication message generation

Requirements:

- stable deterministic outputs
- idempotency-key support where relevant
- request logging without sensitive file content logging
- evidence/provider references allowed only for internal flows

## Hidden Demo and Presenter Scope

Implement:

- hidden `/demo/control`
- passcode gate
- current-case polling
- scenario selector
- orchestration mode selector
- reset / advance / clear review / force timeout controls
- neutral event timeline
- copy case ID / correlation ID

Requirements:

- must not be discoverable in normal customer flow
- must be disableable via environment config
- customer website must not expose Pega unless presenter panel is deliberately opened

## Security Requirements

- all secrets server-side only
- no client-side Pega credentials
- sanitize assistant content before rendering
- never render arbitrary HTML from backend messages
- validate all action payloads server-side
- validate uploads server-side
- do not log raw uploaded document contents
- protect demo-control APIs via passcode/cookie check

## Persistence Requirements

Current acceptable local behavior:

- case state persisted in local server-side store for demo
- refresh resumes correct current stage

Future-friendly expectation:

- persistence abstraction should allow swap from local JSON store to database/service store

## Testing Requirements

### Unit tests

Must cover:

- schemas
- state transitions
- adapter selection
- file validation
- consent payload rules
- address confirmation behavior
- demo-control authorization behavior

### End-to-end tests

Must cover:

- happy path
- address mismatch path
- routine review then completion
- refresh and resume
- timeout path
- unauthorized demo-control API

## Delivery Tasks By Workstream

### Frontend engineer

- homepage and product pages
- onboarding page layouts
- forms and validation UX
- assistant panel
- progress and success states
- mobile responsiveness and accessibility

### Full-stack / BFF engineer

- API routes
- normalized case contract
- adapter selection
- file upload endpoints
- demo-control endpoints
- persistence implementation

### Mock-services engineer

- deterministic tool responses
- idempotent customer creation mock
- execution logging and correlation IDs

### QA engineer

- Playwright flows
- route authorization checks
- cross-refresh validation
- customer-safe copy checks

## Definition of Done

The outside-Pega implementation is complete when:

- public site feels like a real bank website
- onboarding is fully navigable
- all browser interactions go only through BFF APIs
- refresh restores state correctly
- address mismatch requires explicit customer confirmation
- routine review is customer-safe
- hidden control page manages the review scenario
- normalized adapter architecture is preserved
- lint/build/tests pass

## Developer Hand-off Notes

- Treat this layer as the bank’s experience system, not the policy engine.
- Do not embed compliance decisions in the browser.
- Do not expose internal screening semantics in the customer UI.
- Keep all customer states business-safe, even when the backend is running rich orchestration logic.
