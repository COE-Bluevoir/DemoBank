# Master Agent Handoff

## Purpose

This is the primary end-to-end handoff document for a new agent, developer, architect, or implementation lead joining the NorthStar Bank onboarding initiative.

It explains:

- what we are building
- why we are building it
- how the solution is split across outside-Pega and inside-Pega responsibilities
- how the customer journey works end to end
- what has already been implemented in the current codebase
- what still needs to be built
- how to onboard quickly without reading every artifact from scratch

This document should be read first. The more detailed team handoff documents should be read immediately after:

- [outside-pega-implementation-handoff.md](/mnt/c/Users/SandeepBhupathiRaju/Projects/DemoBank/docs/outside-pega-implementation-handoff.md:1)
- [pega-implementation-handoff.md](/mnt/c/Users/SandeepBhupathiRaju/Projects/DemoBank/docs/pega-implementation-handoff.md:1)

## Executive Summary

We are building a retail bank account-opening experience for a fictional bank called NorthStar Bank.

The product being opened is:

- `Everyday Plus Account`

The solution has two simultaneous goals:

1. Present a credible, modern, real-bank-style customer website
2. Demonstrate governed agentic orchestration capabilities behind the scenes

That means the public experience must feel like a real bank website, while the backend orchestration layer can demonstrate:

- agent coordination
- rule-driven decisions
- exception routing
- human review
- auditability
- idempotent downstream actions

The correct design principle is:

- frontstage = real bank experience
- backstage = governed orchestration and capability reveal

## What We Are Building

### Customer-facing outcome

The customer can:

- visit the bank website
- review the Everyday Plus account
- start an application
- provide personal and contact information
- accept consent
- upload identity and proof-of-address documents
- confirm an address mismatch if one is found
- wait through verification and a customer-safe review step
- receive successful onboarding completion with references

### Internal capability outcome

Behind the scenes, the system must be able to:

- create and track an onboarding case
- orchestrate document extraction and screening
- classify mismatches
- create exceptions when policy requires it
- route work to a human reviewer
- resume processing after reviewer approval
- create customer/account records safely
- generate a welcome communication
- preserve an audit trail across all steps

## Solution Shape

### Experience layer

The website is the customer experience layer only.

It owns:

- branding
- page layouts
- forms
- upload interactions
- progress presentation
- customer-safe messages

It must not own:

- compliance policy
- KYC/AML decisions
- exception-routing policy
- final case authority

### Orchestration layer

The orchestration layer sits behind the bank experience API / BFF and owns:

- what happens next
- what checks are mandatory
- what exceptions are created
- when human review is needed
- when customer creation is allowed
- how evidence and audits are stored

Today, the codebase uses a deterministic mock orchestration engine.

Later, that adapter will be replaced by a real Pega-backed adapter.

## Current Repository State

This repository already contains a working implementation of the outside-Pega experience and a deterministic orchestration mock.

### Current stack

- Next.js
- TypeScript
- React
- Tailwind CSS
- React Hook Form
- Zod
- Vitest
- Playwright

### Current implemented routes

- `/`
- `/accounts/everyday-plus`
- `/onboarding/start`
- `/onboarding/[caseId]`
- `/onboarding/[caseId]/status`
- `/demo/control`

### Current implemented technical layers

- frontend banking experience
- normalized onboarding case model
- backend-for-frontend API routes
- adapter abstraction
- mock orchestration state engine
- hidden presenter/demo-control surface
- unit tests
- end-to-end tests

### Important code locations

- normalized types:
  [src/lib/onboarding/types.ts](/mnt/c/Users/SandeepBhupathiRaju/Projects/DemoBank/src/lib/onboarding/types.ts:1)
- mock engine:
  [src/lib/onboarding/engine.ts](/mnt/c/Users/SandeepBhupathiRaju/Projects/DemoBank/src/lib/onboarding/engine.ts:1)
- adapter boundary:
  [src/lib/onboarding/adapters.ts](/mnt/c/Users/SandeepBhupathiRaju/Projects/DemoBank/src/lib/onboarding/adapters.ts:1)
- onboarding UI:
  [src/components/onboarding-flow.tsx](/mnt/c/Users/SandeepBhupathiRaju/Projects/DemoBank/src/components/onboarding-flow.tsx:1)
- presenter control:
  [src/components/demo-control-panel.tsx](/mnt/c/Users/SandeepBhupathiRaju/Projects/DemoBank/src/components/demo-control-panel.tsx:1)

## End-to-End Journey

## 1. Homepage and product discovery

The customer lands on the NorthStar Bank homepage and sees a credible retail-bank presentation.

They can:

- review the Everyday Plus account
- start the onboarding journey

This stage is intentionally simple and bank-like. It should not reveal orchestration details.

## 2. Case creation

When the customer starts the application:

- the website calls the BFF
- the BFF creates a case through the orchestration adapter
- a case ID and correlation ID are generated
- the customer is routed into the onboarding flow

The browser must never call Pega directly.

## 3. Applicant details

The customer provides:

- full legal name
- date of birth
- nationality
- tax residency
- mobile
- email
- residential address
- employment status
- income range

The frontend validates for usability, but authoritative validation belongs to the orchestration layer.

## 4. Consent

The customer accepts a consent statement before continuing.

The system records:

- consent accepted
- timestamp
- consent version
- channel

## 5. Document upload

The customer uploads:

- identity document
- proof of address

In the current mock flow, sample documents can also be used in place of live uploads.

Once both are present:

- the orchestration layer begins document verification

## 6. Address mismatch detection

In the main scripted scenario:

- the entered address differs from the address found in the uploaded document
- this is treated as a correctable mismatch, not a rejection

The customer is shown both values and must explicitly confirm which one is correct.

The system:

- must not silently overwrite the address
- must record the confirmed value and its source

## 7. Screening and policy evaluation

After address confirmation:

- screening runs
- identity and address checks clear
- sanctions clear
- duplicate check clears
- a low-confidence PEP-like review scenario is raised in the main path

Important:

- customer UI must remain neutral
- internal screening details must not be shown publicly

So the customer sees a message like:

- `Routine review`

while the internal orchestration layer preserves the real reason and audit data.

## 8. Human review

The internal reviewer sees:

- the exception summary
- evidence links
- reason codes
- reviewer decision controls

The reviewer:

- approves or rejects
- provides mandatory rationale

If approved, the case continues automatically.

## 9. Customer creation

After review is resolved:

- the orchestration layer creates the customer/account through a downstream service
- this must be idempotent
- retries must never create duplicate customers

The system stores:

- customer reference
- account reference
- product code
- completion timestamp

## 10. Completion

The customer sees:

- success confirmation
- customer/account references
- product name
- next-step CTA

This closes the onboarding journey.

## Main Demo / Use Case Scenarios

### Primary scenario

- `ADDRESS_PEP_REVIEW`

This is the main storyline used for demonstrations and the richest governed flow:

- customer enters details
- uploads documents
- corrects an address mismatch
- screening triggers low-confidence review
- human reviewer approves
- customer creation completes

### Secondary scenario

- `HAPPY_PATH`

This is the simpler end-to-end success flow without review hold.

### Error scenario

- `SERVICE_TIMEOUT`

This demonstrates a safe failure path where the customer sees a neutral saved-application message rather than raw technical failure details.

## Ownership Split

## Outside Pega

Outside Pega includes:

- public website
- onboarding UI
- BFF API layer
- normalized case model
- adapter boundary
- presenter/demo-control UI
- mock orchestration for local development
- local tests

The outside-Pega team should optimize for:

- customer credibility
- clean UX
- resilience
- Pega-independence at the browser layer

## Inside Pega

Inside Pega includes:

- case design
- stages
- data model
- validation rules
- screening rules
- mismatch classification
- exception creation
- assignment routing
- reviewer experience
- customer creation orchestration
- audit trail

The Pega team should optimize for:

- governance
- explainability
- policy control
- human-in-the-loop operations
- structured outputs for the adapter layer

## Core Design Rules

### Rule 1

Customer-facing pages must feel like a real bank website.

### Rule 2

Pega/orchestration terminology must stay out of the normal customer flow.

### Rule 3

The frontend communicates only through the BFF.

### Rule 4

The frontend consumes only a normalized case model.

### Rule 5

Pega remains the authoritative policy and workflow engine.

### Rule 6

Agents may assist, but rules and governed workflow must determine outcomes.

### Rule 7

Any sensitive internal compliance reasoning must stay internal.

## Data and Status Model

The external site relies on a normalized, Pega-independent status model:

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

This model is critical because it prevents the UI from coupling directly to Pega internals.

## Hidden Internal Surfaces

### Demo control

`/demo/control` exists for internal use only.

It allows:

- scenario switching
- orchestration mode switching
- case reset
- mock advancement
- review clearing
- forced timeout
- event inspection
- case ID / correlation ID copy

This surface must remain:

- hidden from normal users
- passcode protected
- disableable via environment variable

### Presenter activity panel

The onboarding route also supports an internal reveal panel activated by:

- `?demo=true`
- keyboard shortcut

This panel is for demos and technical reveals only.

## Operational Plugin Direction

Plugins are not part of the customer experience itself, but they can support real operational workflows.

Recommended plugin mapping exists here:

- [plugin-recommendations.md](/mnt/c/Users/SandeepBhupathiRaju/Projects/DemoBank/docs/plugin-recommendations.md:1)

High-value integrations include:

- Slack or Teams for review alerts
- Gmail or Outlook Email for customer communication
- Google Drive, Box, or SharePoint for internal document operations
- Notion for runbooks and process documentation

## What Still Needs To Be Done

### Outside-Pega follow-on work

- make the public site even more bank-like
- add more realistic support/help content
- harden file handling and storage abstraction
- prepare real Pega adapter implementation
- reduce any remaining sample-data phrasing in customer-visible surfaces if needed

### Pega work not yet built in this repo

- actual Pega case type and stages
- real Pega adapter implementation
- real reviewer assignment flow in Constellation
- real tool invocation via Pega-side integration
- real downstream customer creation integration
- full audit evidence design in Pega

## Recommended Delivery Order

For a new implementation team, work in this sequence:

1. Understand the end-to-end journey
2. Confirm the normalized case contract
3. Finalize the public customer UX
4. Finalize BFF request/response contracts
5. Build or validate Pega case lifecycle and rules
6. Implement document and screening orchestration
7. Implement reviewer flow
8. Implement customer creation with idempotency
9. Validate customer-safe status mapping
10. Execute end-to-end scenario testing

## How A Fresh Agent Should Start

If you are a new agent or developer joining this work, do this first:

1. Read this document fully.
2. Read the outside-Pega and Pega handoff documents.
3. Review the current app routes and normalized types.
4. Review the mock engine to understand the scripted states.
5. Confirm whether your task belongs to:
   - customer experience
   - BFF / adapter
   - Pega orchestration
   - reviewer operations
   - test automation
6. Do not change customer UX based on internal orchestration needs unless product explicitly approves it.
7. Do not expose internal compliance semantics in the public website.

## Related Documents

- [outside-pega-implementation-handoff.md](/mnt/c/Users/SandeepBhupathiRaju/Projects/DemoBank/docs/outside-pega-implementation-handoff.md:1)
- [pega-implementation-handoff.md](/mnt/c/Users/SandeepBhupathiRaju/Projects/DemoBank/docs/pega-implementation-handoff.md:1)
- [api-contract.md](/mnt/c/Users/SandeepBhupathiRaju/Projects/DemoBank/docs/api-contract.md:1)
- [adapter-interface.md](/mnt/c/Users/SandeepBhupathiRaju/Projects/DemoBank/docs/adapter-interface.md:1)
- [presenter-runbook.md](/mnt/c/Users/SandeepBhupathiRaju/Projects/DemoBank/docs/presenter-runbook.md:1)
- [plugin-recommendations.md](/mnt/c/Users/SandeepBhupathiRaju/Projects/DemoBank/docs/plugin-recommendations.md:1)

## Final Guidance

This initiative succeeds only if both halves are strong at the same time:

- the customer journey must feel like a real bank
- the orchestration must behave like a governed, auditable enterprise system

If you compromise either side, the result gets weaker:

- good UI without governed orchestration becomes superficial
- strong orchestration without credible UX becomes a technical demo instead of a believable product

The objective is both worlds together.
