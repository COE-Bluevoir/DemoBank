# Telecom Storyline — Business Connectivity Onboarding and Activation

## Story
**Nila Test Foods Private Limited** selects Telecom and requests **1 Gbps dedicated business fiber** for its warehouse site.

The company uploads the service order, site electricity bill and installation authorization. The documents validate successfully. The MCP serviceability tool checks the site and returns **PARTIAL**: only **500 Mbps** is currently available due to local access capacity.

Pega does not silently downgrade the order. It moves the case to **Pending Information** and asks the customer whether they accept the 500 Mbps alternative. The external app shows the alternative offer. The customer accepts.

Pega resumes checks, credit/contract risk passes, then authorizes fulfilment. The mock telecom fulfilment tool creates the customer, provisions the 500 Mbps subscription and activates a billing account.

## What this storyline proves
- Generic workflow supports serviceability rather than KYC/underwriting.
- Industry pack changes the required external tool set.
- Pega controls a customer-choice loop.
- AI/tool output cannot silently change a commercial order.
- Generic outcome stores subscription and billing references.

## Required synthetic documents
1. `T01_company_incorporation_certificate.png`
2. `T02_authorized_signatory_sample_id.png`
3. `T03_business_connectivity_service_order.png` — requests 1 Gbps
4. `T04_site_address_electricity_bill.png`
5. `T05_site_authorization_letter.png`

## Required MCP calls in order
1. extract_document × documents
2. verify_entity → VERIFIED
3. validate_address → VALID
4. check_duplicate → NO_MATCH
5. check_serviceability → PARTIAL / 1000 requested / 500 available
6. Pega → Pending Information / offer alternative
7. customer accepts 500 Mbps
8. evaluate_external_risk → PASS / score 22
9. create_customer → TEL-CUST-TEST-10001
10. activate_service → SUB-TEST-50001 + BILL-TEST-60001
11. send_notification → SENT

## Pega expected stage path
Initiate → Capture & Consent → Validate Evidence → Perform Checks & Decide → Pending Information → Perform Checks & Decide → Fulfil & Activate → Complete.

## Expected final outcome
- ResolutionStatus: Successful
- ActivationStatus: Active
- ExternalCustomerIdentifier: TEL-CUST-TEST-10001
- ExternalServiceIdentifier: SUB-TEST-50001
- ProductOrServiceCode: business fiber 500 Mbps alternative

## Demo narration
1. Switch to Telecom.
2. Show telecom-specific site/order inputs.
3. Submit into the same Pega case type.
4. Show serviceability tool response.
5. Show customer alternative-choice request.
6. Accept 500 Mbps on external app.
7. Show resumed case and successful activation.
8. End on traceability ledger.
