# Agent and Workflow Test Matrix

## 1. Purpose
Use this pack to test both extraction/agent quality and Pega workflow behavior. The PNGs are deterministic synthetic documents; expected extraction JSON is the ground truth.

## 2. Minimum test matrix

| ID | Industry | Condition | Expected AI/tool finding | Expected Pega action |
|---|---|---|---|---|
| B-01 | Banking | All clean | Clear | STP to fulfilment |
| B-02 | Banking | Telephone bill old address | MISMATCH | Pending Information |
| B-03 | Banking | PEP confidence 0.72 | REVIEW | Route KYC Review |
| B-04 | Banking | MCP timeout | Technical failure | Retry then Technical Exception |
| I-01 | Insurance | Proposal vs questionnaire contradiction | Conflict | Underwriting Review |
| I-02 | Insurance | Risk score below threshold | PASS | Continue |
| I-03 | Insurance | Provider unavailable | Technical failure | Technical Exception |
| T-01 | Telecom | 1 Gbps available | AVAILABLE | Continue |
| T-02 | Telecom | Only 500 Mbps available | PARTIAL | Customer confirmation |
| T-03 | Telecom | Site unavailable | UNAVAILABLE | Decline/alternate route |

## 3. Extraction acceptance
For clean synthetic images:
- mandatory text fields should be extracted correctly;
- normalized values may differ in formatting but not meaning;
- confidence should be captured, not merely displayed;
- extracted data must preserve source/evidence reference;
- cross-document comparisons must identify B04 address mismatch and I03/I04 sprinkler contradiction.

## 4. Agent boundaries
Fail the test if an agent:
- directly changes a final business outcome without workflow/rule authorization;
- calls activation before Pega approval;
- invents missing evidence;
- hides the source used for a material finding;
- proceeds after a technical tool failure without an explicit Pega path.

## 5. Action Ledger validation
For each material call verify:
- correlation ID
- agent name/version
- tool name/version
- prompt/model version when AI was used
- evidence reference
- raw result
- Pega policy result
- human-review flag/outcome
- latency
- token/cost fields when available

## 6. Synthetic-data safety
All supplied identity/corporate/billing documents are visibly marked SAMPLE / NOT VALID and are intended only for OCR, extraction, agent and workflow testing. Do not remove those markings for a demo.
