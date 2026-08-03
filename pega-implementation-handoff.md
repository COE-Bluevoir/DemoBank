# Pega Implementation Handoff

## Purpose

This document defines the scope for the Pega team implementing the governed orchestration layer behind the NorthStar Bank onboarding experience.

The objective is to use Pega as the system that governs:

- case lifecycle
- agent orchestration
- policy decisions
- exception routing
- reviewer assignments
- audit trail
- idempotent downstream execution

The external website must remain independent of Pega at the UI layer, but Pega will remain authoritative for workflow, checks, approvals, and audit.

## Target Outcome

The Pega implementation must:

- receive onboarding requests from the bank experience API
- manage the onboarding case through its stages
- orchestrate bounded agents and approved tools
- enforce rules on when automation can continue
- route unresolved cases to humans
- preserve auditable evidence and decision history
- return a normalized case view to the adapter layer

## Ownership Boundary

The Pega team owns:

- case type design
- stages and processes
- assignments and work queues
- decisioning rules
- exception objects
- agent invocation patterns
- tool allowlists and contracts
- auditability inside Pega
- idempotent external action handling
- transformation from Pega case state to external normalized view

The Pega team does not own:

- public website layout and copy
- browser validation logic
- customer website component design
- frontend route structure
- frontend state management details

## Core Architectural Principle

Pega is the authoritative orchestration layer.

That means Pega owns:

- what steps are required
- which checks are mandatory
- when an exception is created
- when human review is required
- whether the journey can progress
- whether the customer can be created
- how the outcome is audited

Pega must not assume ownership of:

- public site branding
- customer presentation choices
- frontend page composition

## Case Type Scope

### Primary case type

Create an onboarding case type for retail account opening with the following high-level lifecycle:

1. Intake
2. Capture customer details
3. Collect and validate documents
4. Perform screening
5. Resolve exceptions if required
6. Create customer/account
7. Generate completion communication
8. Resolve case

### Recommended stages

- `Intake`
- `Customer Details`
- `Documents`
- `Screening`
- `Resolve Exceptions`
- `Create Customer`
- `Complete`

These do not need to be exposed directly to the customer website. The adapter will map them to customer-safe statuses.

## Data Model Scope

Create or maintain structured case data for:

- applicant
- address
- consent
- product intent
- documents
- extraction results
- screening results
- exceptions
- reviewer decision
- outcome
- execution records
- evidence references

### Suggested object areas

- `Applicant`
- `Address`
- `Consent`
- `Document`
- `CheckResult`
- `Exception`
- `Outcome`
- `ExecutionRecord`

### Required stored values

- `CaseID`
- `CaseVersion`
- `CorrelationID`
- `Channel`
- `ProductCode`
- `ScenarioID`
- `OrchestrationMode`
- `CustomerSafeStatus`
- `LastUpdatedAt`

## Entry Integration Scope

Pega must support case creation from the BFF.

### Required create-case inputs

- product code
- channel
- initial customer intent
- consent accepted flag if sent up front
- timestamp
- correlation/session reference

### Required behavior

- create a new onboarding case
- assign/compute correlation ID
- return initial case reference
- record source channel as web
- initialize case stage and status

## Action Integration Scope

Pega must support action submission for:

- customer details update
- consent capture
- address confirmation
- any additional structured continuation actions needed later

### Rules

- validate server-side
- reject invalid actions cleanly
- preserve case version
- reject stale updates with version conflict response
- update customer-safe status after state changes

## Document Handling Scope

Pega must support ingestion of:

- identity document
- proof-of-address document

### Required behavior

- receive upload metadata and attachment reference
- create document records
- trigger document-processing orchestration
- preserve evidence references
- mark extraction and comparison outcomes

### Important rule

The public website may upload files through the BFF, but Pega must own:

- classification outcome
- extraction outcome
- mismatch determination
- next-step routing

## Agent Orchestration Scope

### Bounded agent model

Use specialized bounded agents rather than one general agent.

Recommended bounded agents:

- Onboarding Agent
- Document Agent
- Screening Agent
- Exception Summary Agent
- Communication Agent

### Responsibilities

#### Onboarding Agent

- guide intake sequencing
- determine next structured action
- produce customer-safe or reviewer-safe messages through approved templates

#### Document Agent

- invoke extraction tools
- compare extracted values against case-entered values
- classify mismatches using rule-controlled output

#### Screening Agent

- orchestrate identity/address/sanctions/PEP/duplicate checks
- consolidate tool outcomes
- pass structured results to rules

#### Exception Summary Agent

- prepare neutral reviewer summaries
- include evidence-backed observations only
- avoid biased approve/reject language

#### Communication Agent

- prepare completion messages using approved templates/fragments only
- never include sensitive screening information in customer communications

## Tool Invocation Scope

### Required patterns

Pega should invoke only approved tools/services for:

- identity extraction
- address extraction
- identity verification
- address validation
- sanctions screening
- PEP screening
- duplicate check
- customer creation
- welcome communication generation

### Governance requirements

- tool access must be allowlisted
- requests must carry correlation ID
- requests must carry idempotency key where relevant
- tool version/provider reference should be captured
- tool outputs must be structured, not free text

## Business Rule Scope

### Address mismatch classification

Implement rules that distinguish:

- correctable mismatch
- material mismatch
- hard stop if needed in future

For the current scenario:

- name and DOB are matching
- address line differs
- mismatch is customer-correctable
- Pega must route to address confirmation rather than rejection

### Screening outcome rules

Implement rules that evaluate:

- PASSED
- CLEAR
- POTENTIAL_MATCH
- FAILED

### Critical policy rule

Low-confidence potential match must not be auto-cleared by agent judgment alone.

Pega rules must decide whether:

- journey may proceed automatically
- exception must be created
- case must route to review
- case must stop

### Reviewer gating rule

Customer creation can proceed only when:

- required checks are clear/passed
- no open blocking exception remains
- reviewer has approved where review is required

## Exception Management Scope

### Required exception object

Store:

- exception type
- severity
- summary
- reason codes
- evidence references
- review status
- reviewer identity
- reviewer decision
- reviewer rationale
- timestamps

### Current scenario

For low-confidence PEP potential match:

- create exception
- route to human review queue
- block customer creation until resolved

## Human Review Scope

### Assignment routing

Route reviewer work to an operations/compliance queue, for example:

- Customer Due Diligence
- Onboarding Review
- Compliance Operations

### Reviewer UI requirements in Constellation

Reviewer must see:

- applicant summary
- screening summary
- mismatch history
- evidence links/references
- unresolved questions
- decision control
- mandatory reasoning field

Reviewer must not be forced to inspect raw clipboard data to understand the case.

### Reviewer actions

- approve
- reject
- optionally request further action in future versions

### Mandatory audit requirements

- reviewer ID
- decision timestamp
- rationale text
- evidence references used

## Customer-Safe Status Mapping Scope

Pega may use internal statuses or stages, but the adapter must be able to map them to:

- `STARTED`
- `INFORMATION_REQUIRED`
- `DOCUMENTS_REQUIRED`
- `VERIFYING_DOCUMENTS`
- `ADDRESS_CONFIRMATION_REQUIRED`
- `SCREENING_IN_PROGRESS`
- `ROUTINE_REVIEW`
- `CREATING_CUSTOMER`
- `COMPLETED`
- `UNABLE_TO_CONTINUE`

The Pega team should expose enough structured state for deterministic mapping, not force the adapter to infer from unstructured notes.

## Outbound Customer Creation Scope

### Required behavior

When the case is approved for completion:

- invoke downstream customer/account creation
- use idempotency key
- persist returned identifiers
- prevent duplicate customer creation on retries

### Required stored outcome values

- `CustomerId`
- `AccountId`
- `ProductCode`
- `ResolvedAt`
- `CompletionMethod`

### Idempotency requirements

- first successful call stores returned identifiers
- retry with same idempotency key must return same references
- Pega must not create duplicates because of retries or transient failures

## Communication Scope

### Completion message generation

Use approved message templates or controlled template fragments.

Customer-facing completion messages may contain:

- greeting
- product name
- customer/account references
- next-step guidance

Customer-facing completion messages must not contain:

- screening results
- PEP terminology
- sanctions terminology
- reviewer notes
- internal provider references

## Audit and Evidence Scope

### Required audit trail

Capture:

- inbound request creation
- case actions submitted
- document-received events
- tool invocations
- tool outputs summary
- rule decisions
- exception creation
- reviewer decision
- customer creation call
- communication generation
- final completion

### Required identifiers

- case ID
- correlation ID
- execution ID
- tool/provider reference
- evidence reference
- idempotency key where used

### Compliance posture

The audit trail must support reconstruction of:

- what happened
- when it happened
- who or what made the decision
- what evidence supported that decision

## Integration Contract Expectations

Pega-side responses to the adapter should expose enough structured data for the BFF to build:

- current action
- current status
- progress state
- assistant messages
- events
- outcome references

Avoid forcing the BFF to parse:

- raw work notes
- freeform assignment instructions
- internal clipboard dumps

## Environment and Mode Support

Pega implementation should support at least these mode concepts:

- `mock-pega`
- `pega`
- `non-pega` as future comparison placeholder

For now, real Pega work should focus on:

- `pega`
- compatible response shape matching current mock mode

## Recommended Delivery Tasks By Pega Workstream

### Pega case designer

- case type and stage design
- data model
- assignments
- routing
- SLA if needed

### Decision/rules engineer

- mismatch classification
- screening decision rules
- exception gating
- status mapping support fields

### Agent/tool integration engineer

- agent definitions
- tool contracts
- orchestration flow
- request/response normalization
- correlation/idempotency handling

### Reviewer UX engineer

- Constellation review views
- evidence presentation
- approval/reject capture
- rationale enforcement

### QA / test engineer

- create-case
- update-details
- document-processing flow
- mismatch flow
- screening flow
- exception review
- retry/idempotency behavior

## Acceptance Criteria

The Pega implementation is complete when:

- case can be created from the BFF
- details and consent can be stored and validated
- documents can be received and processed
- address mismatch routes to customer confirmation
- screening produces structured check results
- low-confidence PEP path creates an exception
- reviewer assignment can be completed in Constellation
- approval unlocks customer creation
- customer creation is idempotent
- completion references are returned
- audit trail is reconstructable end to end
- external website does not require rewrites to integrate the real Pega adapter

## Developer Hand-off Notes

- Keep Pega as the policy and orchestration authority.
- Keep the public website insulated from internal case semantics.
- Prefer structured outputs and explicit fields over narrative-only responses.
- Treat agents as bounded assistants under rule control, not autonomous decision makers.
