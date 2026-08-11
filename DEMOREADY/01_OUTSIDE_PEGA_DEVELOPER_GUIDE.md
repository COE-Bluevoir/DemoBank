# Outside Pega — Developer Implementation Guide

## 1. Objective
Build the external experience and mock enterprise-service layer for the **horizontal Agentic Client Onboarding & Service Activation Accelerator**. The external stack adapts to Banking, Insurance and Telecom while Pega Infinity remains the generic system of workflow execution.

**Do outside Pega:** experience, industry configuration presentation, document intake, synthetic test data, MCP mock services, provider adapters/fixtures, and the API client that starts or updates the Pega case.

**Do not outside Pega:** final eligibility, workflow state, SLA, routing, exception disposition, approval, or activation authorization. Those decisions belong in Pega Infinity.

## 2. Required components

### A. Accelerator launcher / adaptive web app
Recommended existing stack: React + TypeScript + Vite.

Routes:
- `/accelerator` — industry selector
- `/banking` — business current-account onboarding
- `/insurance` — commercial property-policy onboarding
- `/telecom` — business connectivity onboarding
- `/status/:caseId` — external status / correction page

The same component library must render all three journeys. Industry behavior comes from configuration; do not fork three separate applications.

### B. Industry configuration files
Create `config/industries/*.json` with at least:
- `industryCode`
- `journeyCode`
- `displayName`
- `branding`
- `productOrServiceCode`
- `requiredFields`
- `requiredDocuments`
- `consentTextVersion`
- `externalTerminology`
- `pegaCaseType`

Example mapping:
- BANKING / BUSINESS_CURRENT_ACCOUNT
- INSURANCE / COMMERCIAL_PROPERTY_POLICY
- TELECOM / BUSINESS_CONNECTIVITY

The external app uses this configuration only to render the experience and validate obvious UI completeness. Business policy stays in Pega.

## 3. Pega API client
Implement one reusable client module, for example `src/services/pegaClient.ts`.

Responsibilities:
1. Authenticate to the approved Pega API endpoint.
2. Create one `Customer Onboarding` case.
3. Send `industryCode`, `journeyCode`, `partyType`, `productOrServiceCode`, organization, representative, document metadata, consent and channel.
4. Store the returned Pega case ID.
5. Query status for the external status page.
6. Submit customer corrections / additional evidence back to the same case.

Do not expose Pega credentials to the browser. Route Pega calls through a small backend/BFF if credentials cannot be safely handled client-side.

Reference payloads are in `fixtures/case-requests/`.

## 4. Document intake
The browser must support:
- multiple image/PDF uploads;
- document category selection driven by industry config;
- preview;
- removal/replacement;
- synthetic-file warning for demo mode;
- upload progress;
- document metadata sent with the case.

For hackathon use, files can be stored in an approved bucket or application storage. Do not put production/client data in the demo.

## 5. MCP mock service
Build one external MCP server named **Mock Enterprise Services**.

### Transport
Use **Streamable HTTP**. Pega documentation identifies Streamable HTTP as the preferred MCP transport; SSE is for backward compatibility.

### Design
One MCP server exposes normalized tools. Industry-specific behavior is selected using `industryCode`, `journeyCode`, and fixture data.

Required tools:
1. `extract_document`
2. `verify_entity`
3. `check_duplicate`
4. `screen_party`
5. `validate_address`
6. `evaluate_external_risk`
7. `check_serviceability`
8. `create_customer`
9. `activate_service`
10. `send_notification`

The mock server must return deterministic structured JSON. It must not randomly invent decisions.

### Required request envelope for every tool
```json
{
  "correlationId": "CASE-OR-EXECUTION-ID",
  "industryCode": "BANKING",
  "journeyCode": "BUSINESS_CURRENT_ACCOUNT",
  "caseId": "ONB-123",
  "idempotencyKey": "unique-key",
  "schemaVersion": "1.0",
  "payload": {}
}
```

### Required common response envelope
```json
{
  "status": "SUCCESS|PASS|CLEAR|REVIEW|FAIL|MISMATCH|PARTIAL",
  "providerReference": "TEST-REFERENCE",
  "reasonCode": "OPTIONAL_REASON",
  "confidence": 0.98,
  "evidence": {},
  "timestamp": "ISO-8601"
}
```

## 6. MCP tool behavior

### `extract_document`
Purpose: return structured extraction from a supplied test document.

Input: document reference + document type.
Output: extracted fields, confidence per field, overall confidence, extraction status.

For the hackathon, the server may read the `expected-extraction/*.json` fixture rather than run OCR. A second mode can call the real OCR/vision agent to compare output with ground truth.

### `verify_entity`
Purpose: mock company/business registry verification.
Output: verified/not verified, registered name, registration number, provider reference.

### `check_duplicate`
Purpose: simulate CRM/core-system duplicate search.
Output: NO_MATCH or MATCH plus existing customer reference.

### `screen_party`
Purpose: sanctions/PEP/watchlist/fraud-style screening.
Important: return findings only. Pega decides whether to continue, review or reject.

### `validate_address`
Purpose: compare submitted, document and normalized addresses.
Output: VALID/MISMATCH, normalized address and similarity score.

### `evaluate_external_risk`
Purpose: industry-specific external risk signal.
- Banking: KYC/financial-risk signal
- Insurance: underwriting score
- Telecom: credit/contract risk

Return score + reason codes. Do not return the final Pega case decision.

### `check_serviceability`
Telecom-only tool. Return available bandwidth/service options for a site.

### `create_customer`
Simulates creation of the downstream party/customer record.
Return a synthetic external customer identifier.

### `activate_service`
Simulates final fulfilment.
- Banking → account + online banking
- Insurance → bind/issue policy
- Telecom → provision subscription + billing

Pega must call this only after its workflow authorizes activation.

### `send_notification`
Return deterministic message reference and delivery status. Pega owns when and why a message is sent.

## 7. Fixture mode
Support a header or server-side scenario selector such as:
- `BANKING_HERO`
- `INSURANCE_HERO`
- `TELECOM_HERO`
- `HAPPY_PATH`
- `TECHNICAL_FAILURE`

Never allow the UI to change provider results in the production-like demo path. A hidden developer panel may switch fixture modes for testing.

## 8. Required external logging
Log one line/event per MCP invocation:
- correlation ID
- case ID
- tool
- request hash
- fixture/scenario
- response status
- latency
- timestamp

Pega remains the authoritative business audit record; these logs are technical evidence only.

## 9. External app acceptance criteria
- One codebase serves Banking, Insurance and Telecom.
- Industry selector changes fields, labels, documents and branding without changing the Pega case type.
- Banking hero case creates a Pega case and supports a correction round-trip.
- Insurance and Telecom can create the same Pega case type with different industry/journey values.
- MCP mock server is reachable from Pega over Streamable HTTP.
- All tool responses are deterministic and schema-valid.
- No business approval is hard-coded into React or the MCP server.
- Test assets in this pack can be uploaded and processed.

## 10. Suggested repository layout
```text
external-app/
  src/
    config/industries/
    components/
    journeys/
    services/pegaClient.ts
    services/documentClient.ts
  server/
    pega-bff/
  test/

mock-mcp-server/
  tools/
  adapters/
    banking/
    insurance/
    telecom/
  fixtures/
  schemas/
  tests/
```

## 11. Handoff dependencies on Pega team
External team needs from Pega team:
- API base URL and auth pattern
- case type identifier
- create-case payload mapping
- attachment/update contract
- customer-correction action contract
- status values safe to expose externally
- MCP server registration/auth requirements

## 12. Pega product verification references
Developer implementation should be checked against the exact Infinity 26 environment. Pega's 2026 documentation confirms that configured Agents can connect to MCP and that workflow steps can connect to MCP servers; Pega also documents Streamable HTTP as the preferred MCP transport.
