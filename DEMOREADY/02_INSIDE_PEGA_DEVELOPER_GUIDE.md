# Inside Pega — Developer Implementation Guide

## 1. Objective
Refactor the existing **Agentic Customer Onboarding** Pega Infinity 26 proof of concept from a retail-banking-specific model into a **generic Client Onboarding & Service Activation accelerator**.

Current application baseline from the supplied Pega exports:
- one `Customer Onboarding` case type;
- stages for Initiate, Capture Details, Verify Identity, Perform Screening, Resolve Exceptions, Create Customer and Complete;
- data objects Applicant, Address, Consent, Document, Check Result, Exception, Execution, Outcome and Customer;
- agents/personas for onboarding, documents, screening, exception summarization and communication;
- current descriptions and several fields remain retail-banking-specific.

Do not rebuild the application from scratch. Preserve the good generic artifacts and horizontalize the banking-specific ones.

## 2. Case type changes
Keep **one** case type: `Customer Onboarding`.

Recommended primary stages:
1. **Initiate**
2. **Capture & Consent**
3. **Validate Evidence**
4. **Perform Checks & Decide**
5. **Review & Resolve Exceptions**
6. **Fulfil & Activate**
7. **Complete**

Recommended alternate states/stages:
- Pending Information
- Pending Review
- Declined
- Withdrawn
- Technical Exception

Replace the current `Create Customer` stage with `Fulfil & Activate` so the same case can create a bank account, issue an insurance policy, or provision telecom service.

## 3. Case status model
Use consistent statuses:
- New
- InProgress
- Pending-Information
- Pending-Review
- Pending-Activation
- Resolved-Completed
- Resolved-Declined
- Resolved-Withdrawn
- Failed-Technical

Remove any configuration that marks a normal review stage as `Resolved-Rejected` before the case is actually rejected.

## 4. Add generic configuration objects

### A. `OnboardingConfiguration`
Create a new data object with:
- IndustryCode
- JourneyCode
- JourneyName
- PartyType
- ProductOrServiceCode
- DocumentProfile
- CheckProfile
- ConsentProfile
- PolicyProfile
- RiskProfile
- ReviewerRole
- SLAProfile
- KnowledgePack
- PromptProfile
- MCPToolProfile
- ActivationType
- CommunicationTemplateSet
- BrandingProfile
- Version
- Active

Create three initial records:
- BANKING / BUSINESS_CURRENT_ACCOUNT
- INSURANCE / COMMERCIAL_PROPERTY_POLICY
- TELECOM / BUSINESS_CONNECTIVITY

### B. `DocumentRequirement`
Fields:
- IndustryCode
- JourneyCode
- DocumentCode
- DisplayName
- RequiredFlag
- PartyRole
- ValidationProfile
- AcceptedFormats
- Sequence

Use this object/data page rather than a hard-coded `DocumentType` picklist for journey requirements.

### C. `CheckDefinition`
Fields:
- IndustryCode
- JourneyCode
- CheckCode
- CheckCategory
- MCPTool
- MandatoryFlag
- ReviewThreshold
- FailThreshold
- HumanReviewRole
- Sequence

Generic check categories:
IDENTITY, BUSINESS_VERIFICATION, DOCUMENT_VALIDATION, DUPLICATE, WATCHLIST, ADDRESS, ELIGIBILITY, CREDIT, RISK, SERVICEABILITY, UNDERWRITING, FRAUD.

## 5. Party data model

### Keep `Applicant` for the hackathon, but use it as the authorized representative.
Retain generic fields such as name, DOB, nationality, email, mobile and identification number.

Move/stop using banking-only fields in generic logic:
- PreferredBranch
- KYCCompletionDate
- banking-specific ApplicationIntent values
- CustomerSegment when used only as Retail/SME/Corporate banking segmentation

### Add `Organization`
Fields:
- OrganizationName
- RegistrationNumber
- OrganizationType
- TaxIdentifier
- CountryOfRegistration
- IndustrySector
- DateOfIncorporation
- RegisteredAddress
- TradingAddress
- AuthorizedRepresentative (reference)

Case should reference both `Organization` and `Applicant/Representative`.

## 6. Existing objects to keep and modify

### Address — KEEP
Current structure is reusable. Remove fixed calculation placeholders and ensure validation outcomes come from real workflow/tool results.

### Consent — KEEP
Add/retain consent type, accepted status, channel, capture time and text version. Link consent profile to the selected onboarding configuration.

### Document — KEEP, MODIFY
Keep extraction status, evidence reference, mismatch fields and attachment.
Changes:
- make document code/type configuration-driven;
- add `DocumentCode`, `RequirementProfile`, `SourceChannel`, `OCRProvider`, `FieldConfidenceJSON`;
- do not hard-code only Passport/PAN/Aadhaar/etc. as the universal list.

### Check Result — KEEP, MODIFY
Keep provider reference, reason code, confidence, review status, material-decision flag and execution reference.
Changes:
- replace fixed banking-centric CheckType list with configurable `CheckCode` + generic `CheckCategory`;
- store raw provider outcome separately from Pega's deterministic decision.

### Exception — KEEP
This is already well suited for human-in-the-loop review. Continue to capture severity, source check, linked evidence, reviewer, resolution, rationale and timestamps.

### Execution — KEEP AND STRENGTHEN
This is the foundation of the **AI Action Ledger**.
Existing useful fields include tool/agent name and version, correlation ID, idempotency key, schema version, execution result/status, retries, error details and timestamp.

Add:
- MCPServer
- ModelProvider
- ModelName
- ModelVersion
- PromptVersion
- IndustryPackVersion
- InputReference
- OutputReference
- EvidenceReferences
- Confidence
- GuardrailResult
- PolicyResult
- HumanReviewRequired
- HumanReviewOutcome
- InputTokens
- OutputTokens
- EstimatedCost
- LatencyMs
- WorkflowStep
- DecisionRuleName

Every material AI/tool call must create an Execution record.

### Outcome — MODIFY TO GENERIC
Replace account-only semantics with:
- ExternalCustomerIdentifier
- ExternalServiceIdentifier
- OutcomeType
- ProductOrServiceCode
- ResolutionStatus
- ActivationStatus
- CompletionMethod
- CompletionTimestamp
- ProviderReference
- TraceabilityToken

Interpret `ExternalServiceIdentifier` by industry:
- Banking = account number/reference
- Insurance = policy number
- Telecom = subscription/service order

### Customer — REMOVE OR DEFER
The current export shows the Customer object with no substantive model/system of record. Do not invest in it during the hackathon unless a real requirement emerges. Organization + Applicant + Outcome are sufficient.

## 7. Industry-pack loading
At case creation:
1. Validate IndustryCode/JourneyCode.
2. Load `OnboardingConfiguration`.
3. Load required documents.
4. Load required checks.
5. Load consent profile.
6. Set SLA/reviewer/activation profiles.
7. Persist configuration version on the case so later configuration changes do not alter the historical execution explanation.

Suggested data pages:
- `D_OnboardingConfiguration`
- `D_DocumentRequirements`
- `D_CheckDefinitions`
- `D_ConsentProfile`
- `D_MCPToolProfile`

## 8. Agent design
Keep bounded roles.

### Onboarding Agent
Can:
- interpret intent;
- identify missing inputs;
- coordinate allowed agent/tool steps;
- summarize progress.
Cannot approve/decline or directly activate service.

### Document Agent
Can:
- call document extraction tool;
- compare extracted data with case data;
- create findings/mismatch evidence.
Cannot decide final eligibility.

### Screening Agent
Can:
- invoke configured MCP checks;
- normalize results into Check Result records.
Cannot map REVIEW/PASS/FAIL directly to final case resolution except through Pega rules.

### Exception Summary Agent
Can summarize facts, evidence and unresolved questions for the human reviewer. It must not recommend an outcome unless the business explicitly wants a recommendation and the recommendation is separately recorded.

### Communication Agent
Can draft approved customer-facing messages. Pega workflow decides when a message is permitted and which template/context is used.

## 9. MCP integration inside Pega
Pega Infinity 26 documentation supports Agent-to-MCP connectivity and workflow steps connected to MCP servers. Configure one MCP connection to the external **Mock Enterprise Services** server.

Preferred transport: Streamable HTTP.

Register/allow only the tools required by each agent or workflow step. Do not give every agent every MCP tool.

Suggested tool access:
- Document Agent → extract_document, validate_address
- Screening Agent → verify_entity, check_duplicate, screen_party, evaluate_external_risk, check_serviceability
- Fulfil/Activate workflow step → create_customer, activate_service
- Communication Agent/workflow → send_notification

Map every call to an Execution record using correlation ID and idempotency key.

## 10. Deterministic decisions
Build decision tables/rules in Pega; do not place them in the LLM or MCP mock.

Examples:

### Banking screening
- PEP confidence < 0.60 → Continue
- 0.60–0.85 → Pending Review / KYC Officer
- > 0.85 → Compliance escalation or decline path according to demo policy

### Address validation
- VALID → Continue
- MISMATCH and customer-correctable → Pending Information
- MISMATCH after correction → Reviewer

### Insurance risk
- no conflicts + score < threshold → Continue
- contradictory risk evidence → Underwriter review
- underwriter may approve with conditions

### Telecom serviceability
- requested service available → Continue
- lower service available → request customer acceptance of alternative
- no service → decline/alternate offering

## 11. Human work queues
Create/configure:
- `OnboardingOps`
- `KYCReview`
- `UnderwritingReview`
- `ActivationReview`
- `TechnicalExceptions`

Routing is configuration-driven using ReviewerRole / industry pack.

## 12. External-user handling
Do not use the internal Work Portal as the primary experience for the customer/applicant. The external React app is the customer channel.

Human Pega personas for the hackathon:
- Operations Reviewer
- Specialist Reviewer (role varies: KYC Officer / Underwriter / Activation Specialist)
- Administrator

Agents should remain agents/tools, not treated as human portal personas.

## 13. Required Pega views
1. Case summary
2. Evidence/documents
3. Check results
4. Exceptions & human review
5. **AI Action Ledger** (Execution records)
6. Fulfilment/activation result
7. Full history / SLA

AI Action Ledger view should answer:
- What ran?
- Which model/tool/version?
- Why was it invoked?
- Which evidence was used?
- What did it return?
- What Pega rule acted on the result?
- Was human review required?
- What was the final action?
- What did the call cost / how many tokens / how long did it take?

## 14. Fix placeholder/calculated values before demo
The supplied model contains several fields with fixed placeholder calculations (for example flags always true, risk score 0 and fixed dates/timestamps). Replace these with runtime values or remove them from the demo UI.

## 15. Compare-and-contrast demo support
For the hero Banking story, capture an optional comparison card:

**AI-only observation:** extraction/recommendation can identify a mismatch or possible PEP match.

**Infinity execution:** case state, deterministic threshold, SLA, reviewer assignment, correction loop, activation authorization and audit are controlled by Pega.

Do not create a second competing workflow. The comparison is explanatory evidence around the same scenario.

## 16. Definition of done
- Same case type accepts all three industry/journey codes.
- Banking runs fully end-to-end including correction + human review + activation.
- Insurance and Telecom prove configuration-driven documents/checks/roles/outcome.
- MCP calls are visible as Execution records.
- Every material external call has correlation ID, provider reference and traceability.
- Final activation cannot happen directly from an AI response.
- Current retail-banking-specific descriptions/labels are removed from generic reusable components.
