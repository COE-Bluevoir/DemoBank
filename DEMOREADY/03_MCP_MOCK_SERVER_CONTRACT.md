# MCP Mock Enterprise Services — Contract and Fixture Design

## 1. Purpose
Provide one deterministic MCP server that stands in for enterprise systems that are unavailable during the hackathon. The server is a **test double**, not the workflow engine.

Pega Infinity owns process state and deterministic business decisions. MCP tools return facts, signals, external-system outcomes, or fulfilment responses.

## 2. Transport and hosting
- Protocol: MCP
- Preferred transport: Streamable HTTP
- Environment: local container, approved VM, or approved AWS runtime reachable from Pega
- Authentication: use the mechanism supported/approved for the team's Pega environment; never hard-code secrets
- Base server logical name: `mock-enterprise-services`

## 3. Generic envelope
All tools accept correlation / idempotency metadata and return deterministic JSON.

```json
{
  "correlationId": "ONB-123-EXEC-001",
  "industryCode": "BANKING",
  "journeyCode": "BUSINESS_CURRENT_ACCOUNT",
  "caseId": "ONB-123",
  "idempotencyKey": "ONB-123-screen-party-1",
  "schemaVersion": "1.0",
  "payload": {}
}
```

## 4. Tool catalogue

| Tool | Banking | Insurance | Telecom | Side effect |
|---|---:|---:|---:|---|
| extract_document | Yes | Yes | Yes | No |
| verify_entity | Yes | Yes | Yes | No |
| check_duplicate | Yes | Optional | Yes | No |
| screen_party | Yes | Yes | Optional | No |
| validate_address | Yes | Optional | Yes | No |
| evaluate_external_risk | Yes | Yes | Yes | No |
| check_serviceability | No | No | Yes | No |
| create_customer | Yes | Yes | Yes | Simulated |
| activate_service | Yes | Yes | Yes | Simulated |
| send_notification | Yes | Yes | Yes | Simulated |

## 5. Contracts

### extract_document
Input:
```json
{"documentRef":"B04_telephone_bill_address_mismatch.png","documentCode":"ADDRESS_PROOF"}
```
Output:
```json
{
  "status":"SUCCESS",
  "providerReference":"DOC-TEST-001",
  "overallConfidence":0.98,
  "fields":{"Subscriber Name":"...","Service Address":"..."},
  "fieldConfidence":{"Subscriber Name":0.99,"Service Address":0.97}
}
```

### verify_entity
Input: organization name, registration number, tax ID.
Output: VERIFIED / NOT_VERIFIED + normalized registry data.

### check_duplicate
Input: organization/representative identifiers.
Output: NO_MATCH / MATCH + existing external customer ID when applicable.

### screen_party
Input: party name, DOB/registration, nationality/country.
Output: CLEAR / REVIEW / MATCH with reason code, score/confidence and evidence summary.

### validate_address
Input: submitted address and evidence address.
Output: VALID / MISMATCH + similarity and normalized values.

### evaluate_external_risk
Input: industry + relevant structured data.
Output: PASS / REVIEW / FAIL, score and reason codes.

### check_serviceability
Input: installation site + requested bandwidth/product.
Output: AVAILABLE / PARTIAL / UNAVAILABLE + available options.

### create_customer
Input: approved party/customer data.
Output: SUCCESS / FAILURE + synthetic external customer identifier.
Must support idempotency.

### activate_service
Input: external customer ID + approved product/service.
Output:
- Banking: synthetic account reference
- Insurance: synthetic policy number
- Telecom: synthetic subscription/service + billing reference
Must support idempotency.

### send_notification
Input: recipient test contact, template code, message variables.
Output: SENT/FAILED + synthetic message reference.

## 6. Scenario fixtures
Use the JSON files under `fixtures/mcp-responses/` as the canonical hero responses.

### Banking hero
- entity verified
- address mismatch first
- potential PEP name match at 0.72 → human review
- duplicate clear
- customer creation succeeds
- account activation succeeds

### Insurance hero
- entity verified
- screening clear
- risk tool returns REVIEW due to sprinkler contradiction
- underwriter approves with a condition
- policy issuance succeeds

### Telecom hero
- entity verified
- site valid
- 1 Gbps requested but only 500 Mbps available
- customer accepts alternative
- credit risk passes
- 500 Mbps service activation succeeds

## 7. Failure fixtures developers must add
Each tool must support at least:
- timeout
- HTTP/MCP transport error
- malformed response
- provider unavailable
- duplicate idempotency request

Pega should convert these to technical exceptions/retries rather than allow an agent to silently continue.

## 8. Rule boundary
The mock server may calculate evidence similarity or return provider-style risk scores, but it must **not** decide:
- Pega stage
- assignment
- SLA
- final approval/decline
- whether human review is mandatory
- whether activation is authorized

Those belong to Pega rules and workflow.
