# Insurance Storyline — Commercial Property Policy Onboarding

## Story
**Nila Test Foods Private Limited** selects the Insurance experience and applies for a commercial property policy covering its warehouse.

The proposal form states that the warehouse has an **automatic sprinkler system: YES**. The separately uploaded fire-risk questionnaire states **NO**. The document agent extracts both answers and flags a cross-document contradiction.

The external underwriting-risk mock service returns a REVIEW score of 68 with reason `SPRINKLER_DATA_CONFLICT`. Pega routes the case to an **Underwriter**. The exception summary agent presents the conflicting evidence without changing case state or making the final decision.

For the demo, the underwriter approves the risk **subject to sprinkler verification within 30 days**. Pega records the condition, authorizes policy issuance, calls the mock policy-administration service and receives synthetic policy `POL-TEST-2026-0001`.

## What this storyline proves
- Same generic case type works outside banking.
- Different document profile and specialist role are loaded by configuration.
- AI detects a contradiction across two documents.
- External risk service returns a signal, not a final decision.
- Human underwriter can approve with conditions.
- Generic `ExternalServiceIdentifier` represents a policy number.

## Required synthetic documents
1. `I01_company_incorporation_certificate.png`
2. `I02_authorized_signatory_sample_id.png`
3. `I03_commercial_insurance_proposal_form.png` — sprinkler YES
4. `I04_fire_risk_questionnaire_conflict.png` — sprinkler NO
5. `I05_property_schedule.png`

## Required MCP calls in order
1. extract_document × documents
2. verify_entity → VERIFIED
3. screen_party → CLEAR
4. evaluate_external_risk → REVIEW / score 68 / SPRINKLER_DATA_CONFLICT
5. Pega rules → Underwriting Review
6. human underwriter → APPROVE WITH CONDITION
7. create_customer → INS-CUST-TEST-10001
8. activate_service → policy issued / POL-TEST-2026-0001
9. send_notification → SENT

## Pega expected stage path
Initiate → Capture & Consent → Validate Evidence → Perform Checks & Decide → Review & Resolve Exceptions → Fulfil & Activate → Complete.

## Expected final outcome
- ResolutionStatus: Successful
- ActivationStatus: Active-With-Condition
- ExternalCustomerIdentifier: INS-CUST-TEST-10001
- ExternalServiceIdentifier: POL-TEST-2026-0001
- ResolutionComments: Sprinkler verification required within 30 days

## Demo narration
1. Switch accelerator to Insurance.
2. Show that the external UI now requests proposal/risk documents rather than bank documents.
3. Submit the case into the same Pega case type.
4. Show cross-document contradiction.
5. Show underwriter queue and evidence summary.
6. Approve with condition.
7. Show policy issuance response and Action Ledger.
