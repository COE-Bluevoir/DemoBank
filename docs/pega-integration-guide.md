# Pega Integration Guide

This is the connection specification for the NorthStar Bank onboarding website.

Everything outside Pega is implemented. This document tells the Pega team
exactly what to build on their side and how to point it at this application.

There are two directions of traffic:

1. **Website → Pega** — the website calls Pega to create and drive cases.
2. **Pega → Website** — Pega calls the website's tool services and pulls
   uploaded document evidence.

---

## 1. Turning the connection on

Set these in `.env.local` (see [.env.example](../.env.example)):

| Variable | Required | Purpose |
| --- | --- | --- |
| `ORCHESTRATION_MODE` | yes | Set to `pega` for live orchestration |
| `PEGA_BASE_URL` | yes | Root of the Pega application API |
| `PEGA_TOKEN_URL` | yes | OAuth 2.0 token endpoint |
| `PEGA_CLIENT_ID` | yes | Client-credentials registration |
| `PEGA_CLIENT_SECRET` | yes | Client-credentials secret |
| `PEGA_CASE_TYPE_ID` | no | Case type used on create (defaults provided) |
| `PEGA_TIMEOUT_MS` | no | Per-request timeout, default `12000` |
| `PEGA_MAX_RETRIES` | no | Retry budget for transient errors, default `2` |
| `SERVICE_API_KEY` | yes in deployed envs | Shared secret Pega presents when calling back |

If `ORCHESTRATION_MODE=pega` and any required value is missing, **the
application refuses to start**. It will not silently fall back to the mock
engine, because a broken integration that looks healthy is worse than one that
fails loudly.

Verify the connection at any time:

```
GET /api/health           # configuration only
GET /api/health?deep=true # also performs a real token acquisition
```

`deep=true` returns `pega.reachable: true` once credentials work end to end.

---

## 2. Website → Pega

**Verified live** against `bv-infax-261.pegademo.com`, application `AgenticC`,
case type `ODHMNT-AgenticC-Work-CustomerOnboardingUnified`
("Customer Onboarding (Unified)").

The website speaks the **native Pega DX API v2**. No custom wrapper service is
required on the Pega side.

### Authentication

OAuth 2.0 client credentials against
`/prweb/PRRestService/oauth2/v1/token`. The token is cached until 60 seconds
before expiry, concurrent refreshes are collapsed into one call, and a `401`
triggers exactly one re-authentication and retry.

### Endpoints used

All paths are relative to `PEGA_BASE_URL`
(`https://<host>/prweb/api/application/v2`).

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/casetypes` | Confirm the configured case type exists |
| `POST` | `/cases` | Create an onboarding case |
| `GET` | `/cases/{caseID}` | Read case state, stages and assignments |
| `GET` | `/assignments/{assignmentID}/actions/{actionID}` | Read a flow action's fields and eTag |
| `PATCH` | `/assignments/{assignmentID}/actions/{actionID}` | Submit a flow action |

### Optimistic concurrency

Pega returns its concurrency token in the **`etag` response header**, not the
body. The website reads it from every response and sends it back as `If-Match`
on writes. A stale token produces Pega's `Resource is stale` error, which is
surfaced to the browser as a `409` so it can refresh and retry.

The eTag used on a write is the one returned by the **flow action** endpoint,
which is what Pega validates against.

### Submitting flow actions

Pega rejects a submission containing any property the current action's view
does not expose. The website therefore reads the action first, takes its
content keys as an allowlist, and sends only matching fields. Pega-internal
properties (`px*`, `py*`, `pz*`, `classID`) are never submitted.

This means **the Pega team can add or rename fields on a flow action without a
website change** — the adapter discovers them at request time.

### Status mapping

Derived from the case's stage, keyed on stage **name** (what the designer
controls) with the stage **ID** as fallback. A `Resolved-*` work status wins
over the stage.

| Pega stage | Website status | Customer sees |
| --- | --- | --- |
| Initiate / Intake | `STARTED` | Application started |
| Capture Details | `INFORMATION_REQUIRED` | Information required |
| Documents | `DOCUMENTS_REQUIRED` | Information required |
| Verify Identity | `VERIFYING_DOCUMENTS` | Documents being verified |
| Perform Screening | `SCREENING_IN_PROGRESS` | Checks in progress |
| Resolve Exceptions | `ROUTINE_REVIEW` | Routine review |
| Create Customer | `CREATING_CUSTOMER` | Account being created |
| Complete | `COMPLETED` | Onboarding complete |
| Pending Information (ALT) | `INFORMATION_REQUIRED` | Information required |
| Pending Review (ALT) | `ROUTINE_REVIEW` | Routine review |
| Declined / Withdrawn / Approval Rejection (ALT) | `UNABLE_TO_CONTINUE` | Unable to continue |
| `Resolved-Completed` | `COMPLETED` | Onboarding complete |
| any other `Resolved-*` | `UNABLE_TO_CONTINUE` | Unable to continue |

Add a new stage and it maps by name; rename one and it falls back to the
stage ID. Unrecognised stages default to `STARTED` rather than erroring.

### Case content the website reads

Optional — absent fields simply mean the UI keeps asking for them.

| Pega property | Used for |
| --- | --- |
| `Applicant.ApplicantName` / `CustomerOnboardingName` | Applicant name |
| `Applicant.{DateOfBirth,Nationality,Mobile,Email,…}` | Applicant detail |
| `Address.{AddressLine1,City,Region,PostalCode,Country}` | Residential address |
| `Documents[]` | Uploaded evidence list |
| `CustomerID`, `AccountID` | Completion references |
| `ProductIntent` | Product name on completion |

> **Customer-safety rule:** the website renders **no** free text from Pega.
> Status labels and action labels come from a fixed customer-safe table, so
> assignment names like "PEP potential match review" can never reach a
> customer. Put internal reasoning in the case; it stays internal.

### Error handling

| Pega returns | Website behaviour |
| --- | --- |
| `401` / `403` | One re-auth attempt, then a neutral saved-application message |
| `404` | Application not found |
| `409` (stale eTag) | Version conflict — the browser refreshes and retries |
| `400` / `422` | Neutral "information could not be accepted" message |
| `429` / `5xx` | Retried with backoff, then a neutral message |

Raw Pega error text is **logged server-side and never returned** to the
browser.

## 3. Pega → Website

### Tool services

Pega invokes approved tools at `POST /api/services/{tool}`.

| Header | Required | Purpose |
| --- | --- | --- |
| `x-service-api-key` | when `SERVICE_API_KEY` is set | Authentication |
| `x-correlation-id` | recommended | Echoed into the response `meta` |
| `x-idempotency-key` | required for `create-customer` | Retry safety |

Discover the live allowlist with `GET /api/services`.

| Tool | Side effect | Idempotency key |
| --- | --- | --- |
| `extract-identity` | none | optional |
| `extract-address` | none | optional |
| `verify-identity` | none | optional |
| `validate-address` | none | optional |
| `screen-sanctions` | none | optional |
| `screen-pep` | none | optional |
| `check-duplicate` | none | optional |
| `create-customer` | **opens an account** | **required** |
| `generate-communication` | none | optional |

Every response uses the same envelope:

```jsonc
{
  "meta": {
    "tool": "screen-pep",
    "providerReference": "PRV-3F2A19",
    "toolVersion": "1.0.0",
    "correlationId": "corr-…",
    "executionId": "exec-…",
    "completedAt": "2026-08-03T10:00:00.000Z",
    "replayed": false          // true when served from the idempotency store
  },
  "result": { /* tool-specific, always structured */ }
}
```

Request and response shapes are in
[src/lib/services/contracts.ts](../src/lib/services/contracts.ts).

Behaviour worth knowing:

- Outputs are **deterministic** — identical input yields identical output, so
  demos are repeatable and tests are stable.
- Tools return **evidence, not decisions**. `validate-address` proposes a
  `suggestedClassification`; only Pega rules decide routing.
- `screen-pep` returns `POTENTIAL_MATCH` at `0.62` confidence for the scripted
  applicant and never self-clears it.
- A repeated `create-customer` call with the same idempotency key returns the
  original identifiers with `replayed: true`. Reusing a key with a *different*
  payload returns `409`.

### Retrieving document evidence

Uploaded files are stored by the website, not sent to Pega in a request body.
`POST /cases/{caseId}/documents` carries a `storageReference`; Pega fetches the
content with:

```
GET  /api/internal/documents/{storageReference}   # bytes
HEAD /api/internal/documents/{storageReference}   # metadata only
```

Both require `x-service-api-key`. Responses carry `X-Document-Sha256` for
integrity verification.

Uploads are validated before storage: size limits are enforced before the body
is buffered, and the real content type is confirmed from magic bytes, so a
renamed executable is rejected even if it claims to be a PDF.

---

## 4. What the website does not do

These remain Pega's responsibility:

- deciding when a check is mandatory
- classifying a mismatch as correctable or material
- creating exceptions and routing to a review queue
- gating customer creation on reviewer approval
- the audit trail of record

The website enforces none of this and must not be relied on to.

---

## 5. Verifying before Pega is ready

The whole inbound surface can be exercised without a Pega instance:

```bash
npm run test:unit      # 86 unit tests
npm run test:e2e       # 20 end-to-end tests
curl localhost:3000/api/health
curl localhost:3000/api/services
```

`tests/e2e/integration-surface.spec.ts` covers the tool allowlist, contract
validation, idempotent customer creation and document retrieval.

## Related documents

- [adapter-interface.md](./adapter-interface.md)
- [api-contract.md](./api-contract.md)
- [pega-implementation-handoff.md](../pega-implementation-handoff.md)
