# Banking Storyline — SME Business Current Account + Online Banking

## Story
**Nila Test Foods Private Limited** applies on the mock bank website for a business current account and online banking.

The representative, **Arjun Demo Kumar**, enters the company's current registered address and uploads incorporation, identity, tax and telephone-bill evidence. The telephone bill intentionally contains the company's old address. The document agent extracts the address and identifies the discrepancy.

Pega moves the case to **Pending Information** and the external app asks the customer to correct or provide new evidence. The customer uploads the corrected telephone bill.

The screening tool then returns a **potential PEP name match with confidence 0.72**. Pega's deterministic threshold sends the case to a KYC reviewer. The reviewer sees the evidence, notes that DOB/location do not match the watchlist candidate, records a false-positive rationale and approves continuation.

Pega authorizes fulfilment. The mock core-banking services create a synthetic customer/CIF, open a business current account, activate online banking and return references. Pega closes the case and the communication agent sends the completion message.

## What this storyline proves
- AI/document reasoning detects evidence mismatch.
- Customer-correctable exception loop works.
- External screening finding does not make the final decision.
- Pega threshold/routing/SLA creates human review.
- Reviewer rationale is recorded.
- Pega authorizes downstream activation.
- AI Action Ledger shows model/tool/evidence/rule/human outcome.

## Required synthetic documents
1. `B01_company_incorporation_certificate.png`
2. `B02_authorized_signatory_sample_id.png` — clearly marked NOT A GOVERNMENT ID
3. `B03_tax_registration_certificate.png`
4. `B04_telephone_bill_address_mismatch.png` — old address, triggers correction
5. `B05_telephone_bill_address_corrected.png` — current address, submitted during correction

Ground truth extraction JSON exists for every file under `fixtures/expected-extraction/`.

## Required MCP calls in order
1. extract_document × uploaded documents
2. verify_entity → VERIFIED
3. validate_address → MISMATCH
4. Pega → Pending Information
5. customer uploads corrected bill
6. extract_document → SUCCESS
7. validate_address → VALID
8. check_duplicate → NO_MATCH
9. screen_party → REVIEW / POTENTIAL_PEP_NAME_MATCH / 0.72
10. Pega decision table → KYC Review
11. human reviewer → APPROVE FALSE POSITIVE
12. create_customer → CIF-TEST-10001
13. activate_service → ACC-TEST-20001
14. send_notification → SENT

## Pega expected stage path
Initiate → Capture & Consent → Validate Evidence → Pending Information → Validate Evidence → Perform Checks & Decide → Review & Resolve Exceptions → Fulfil & Activate → Complete.

## Expected final outcome
- ResolutionStatus: Successful
- ActivationStatus: Active
- ExternalCustomerIdentifier: CIF-TEST-10001
- ExternalServiceIdentifier: ACC-TEST-20001
- CompletionMethod: Manual intervention (because KYC review occurred)

## Demo narration
1. Choose Banking in accelerator.
2. Show fields/documents adapt to banking.
3. Upload four documents.
4. Open Pega and show extracted evidence + mismatch.
5. Show customer correction request.
6. Upload corrected telephone bill from external app.
7. Show screening finding and deterministic review routing.
8. Review/approve in Pega with rationale.
9. Show MCP activation responses.
10. Finish on Action Ledger + successful customer status.
