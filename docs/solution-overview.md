# Solution Overview

**Live:** https://main.d1owc2e77burr9.amplifyapp.com
**Repos:** `COE-Bluevoir/DemoBank` and `shreyas-bluevoir/DemoBANK` (in sync, auto-deploy from `main`)
**Last verified:** 2026-08-06

A governed client-onboarding accelerator. One platform, one onboarding flow,
adapted to each industry by configuration. AI interprets; the workflow governs.

---

## 1. The switch

`ORCHESTRATION_MODE` selects which system runs the business workflow. The two
production modes are **complete and mutually exclusive** implementations of the
same journey — neither borrows from the other, which is what makes comparing
them meaningful.

| | `pega` | `non-pega` |
|---|---|---|
| Orchestration authority | Pega, entirely | AWS/Bedrock, entirely |
| This application's role | experience and API adapter only | experience and API adapter only |
| Case state | Pega | DynamoDB (S3 for evidence) |
| Policy and rules | Pega | `src/lib/orchestration/policy.ts` |
| Exceptions | Pega | own exception records |
| Human-review gating | Pega assignments | own review gate |
| Tool execution | Pega | tool invoker |
| Activation | Pega | `create-customer`, idempotent |
| Bedrock in the workflow | **none** | all interpretation |
| Pega called | yes | **never** |

`mock-pega` is a third, local-only mode: a deterministic stand-in for the Pega
path so the journey runs with no external dependencies.

```
  /accelerator  ── choose industry ──▶  /banking · /insurance · /telecom
                                              │
                                     industry pack supplies
                                     branding · vocabulary ·
                                     intake fields · evidence
                                              │
                                    ┌─────────▼─────────┐
                                    │  Onboarding BFF   │  normalized case model
                                    └─────────┬─────────┘
                    ORCHESTRATION_MODE selects exactly one:
              ┌───────────────┬───────────────┬───────────────┐
        ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
        │ mock-pega │   │   pega    │   │ non-pega  │
        │  (local)  │   │ DX API v2 │   │  Bedrock  │
        └───────────┘   └───────────┘   └───────────┘
                          Pega owns      agents + policy
                          everything     engine own
                                         everything
```

Routes, UI and the normalized case model are identical in every mode: they all
satisfy `OnboardingOrchestrationAdapter`.

### Verified non-Pega journey

A complete case with no Pega involvement, showing who decided what:

```
CASE        Case created          opened outside the governed workflow
CASE        Details captured      applicant details recorded
HUMAN       Consent captured      customer accepted the consent statement
AGENT       document              1 discrepancy(ies) found
AGENT       screening             one or more checks require human review
RULE        Policy evaluated      MANUAL_REVIEW_REQUIRED
HUMAN       Review cleared        reviewer ops.reviewer cleared the case
INTEGRATION Customer created      account opened

exceptions : DOCUMENT_DISCREPANCY/CORRECTABLE, SCREENING_SCREEN_PEP/MATERIAL
screening  : sanctions=CLEAR pep=POTENTIAL_MATCH duplicate=CLEAR bureau=PASSED
outcome    : CUST-647389 / ACC-831033
```

Agents produced the evidence; the deterministic policy engine decided what it
meant; the review gate held the case until a person cleared it. That division
is the same one Pega enforces — implemented outside it.

## 2. Industry packs

`src/lib/industry/` — a pack declares branding, terminology, intake fields,
required evidence, consent wording, connected systems and sample data.

| | Banking | Insurance | Telecom |
|---|---|---|---|
| Organisation | NorthStar Bank | Meridian Insurance | Vantage Connect |
| Product | Everyday Plus Account | Household Protect Policy | Business Fibre 500 |
| Customer is a… | customer | policyholder | subscriber |
| Depth | **reference implementation** | adaptability demo | adaptability demo |

Packs may only declare fields the shared applicant model can store — enforced
by tests, so a pack cannot invent storage. `industryId` is presentation-only
and never crosses into the orchestration layer: Pega runs one common flow for
every industry.

## 3. The agent layer

`src/lib/agents/` — runs **outside** the workflow and enters it only when
governance is required.

| Agent | Does | Model |
|---|---|---|
| Orchestrator | Classifies intent, composes the reply | Nova 2 Lite (cheap, every turn) |
| Policy | Grounded answers from the pack | Nova Pro (holds the stricter contract) |
| Document | Extracts and compares evidence | tools, deterministic |
| Screening | Runs sanctions/PEP/duplicate/bureau | tools, deterministic |

### Decisions kept out of the model, deliberately

1. **`requiresGovernedExecution`** is derived in code from the intent. A test
   proves a model claiming `ASK_POLICY` with `confidence: 0.99` still cannot
   reach the workflow.
2. **Delegation** is a code-level table — the model's own routing varied
   between identical questions.
3. **Extracted fields** are filtered to what the pack declares.
4. **The tool allowlist** is enforced server-side; an agent cannot invoke an
   unregistered capability whatever the model generates.

No agent owns case state, decides eligibility, or adjudicates. A discrepancy is
described, a screening hit is reported — the workflow decides.

### Provider seam

`AGENT_PROVIDER=deterministic` needs no AWS and keeps the journey
demonstrable; `bedrock` uses real inference. Same contracts either way.

## 4. Governance

Every agent decision writes a ledger record **before** its result is used:
actor, provider, model, prompt template + version, pack version, intent,
grounding, confidence, latency, outcome, failure reason.

**Console:** `/accelerator/governance` — enter a request, see it interpreted
once and run down both paths, with a 10-dimension capability comparison and the
full ledger. Interpretation is shared between paths so the difference shown is
architectural, not two samples of the same model.

## 5. Pega integration

Native **DX API v2** against `bv-infax-261.pegademo.com`, case type
`ODHMNT-AgenticC-Work-CustomerOnboardingUnified`.

- OAuth2 client credentials, token cached with single-flight refresh
- eTag concurrency (read from the response **header**, replayed as `If-Match`)
- Submissions filtered to the fields each flow action actually exposes,
  including nested pages — so Pega can add fields without a website change
- Dropdown values chosen from Pega's own list
- Documents uploaded to Pega's attachment store and linked to the case
- **Customer gates:** consent and documents are never auto-submitted before the
  customer actually provides them
- Upstream failures become neutral customer messages; detail is logged only

Known Pega-side gaps are tracked in
[pega-mcp-integration.md](./pega-mcp-integration.md).

## 6. Deployed infrastructure

| Resource | Identifier |
|---|---|
| Amplify app | `d1owc2e77burr9` (`WEB_COMPUTE`, auto-build from `main`) |
| DynamoDB | `northstar-onboarding-state` — `pk`+`sk`, on-demand, TTL on `ttl` |
| S3 | `northstar-onboarding-docs-207567777842` — public access blocked, AES256 |
| Compute role | `NorthStarAmplifyComputeRole` — least privilege |
| Region | `us-east-1` |

DynamoDB holds case state, the agent ledger and idempotency records. S3 holds
uploaded evidence; Pega pulls it from `/api/internal/documents/{ref}`.

### Two Amplify traps worth remembering

1. **App environment variables do not reach the SSR runtime.** The build must
   write them into `.env.production` — see `amplify.yml`. Without this the app
   silently boots with defaults.
2. **`computeRoleArn` is separate from `iamServiceRoleArn`.** Setting only the
   service role leaves the SSR runtime with no permissions.

## 7. Configuration

Driver-style switches, all defaulting to the safe local option:

| Variable | Options | Default |
|---|---|---|
| `ORCHESTRATION_MODE` | `mock-pega` · `pega` · `non-pega` | `mock-pega` |
| `STORAGE_DRIVER` | `file` · `aws` | `file` |
| `AGENT_PROVIDER` | `deterministic` · `bedrock` | `deterministic` |
| `DEMO_CONTROL_ENABLED` | `true` · `false` | `true` (**false in production**) |

Credentials come from the AWS default provider chain — never from config.
Full list in [.env.example](../.env.example).

**Running locally:** `npm run dev` works with no AWS and no Pega. Add
`.env.local` to point at either.

## 8. Verification

| | |
|---|---|
| Unit tests | 146 |
| End-to-end | 19 |
| Lint / typecheck / build | clean |

Tests are **hermetic** — `src/test/setup.ts` clears deployment configuration so
they run identically on a laptop and in the build. This was a real defect:
exporting the build's environment turned 0 failures into 15.

## 9. What works, and what does not

**Working in production:** all routes; health with live Pega (`reachable: true`);
Bedrock agents with correct intent routing and grounded answers; DynamoDB state
across requests; S3 upload; real Pega case creation through consent and identity
document.

**Not working:**

- **Address document upload returns 422 in production.** Identity upload
  succeeds, so S3, the compute role and the attachment path are all fine — it
  is specific to the second document. Undiagnosed.
- **AgentCore Gateway / MCP** — the tool seam exists but tools are invoked
  in-process. Gateway needs the services reachable at a public endpoint.
- **Bedrock Knowledge Bases** — the policy agent grounds in the industry pack,
  not a vector store.
- **Anthropic models** — blocked behind the Bedrock use-case form; Nova is in
  use and works.
- **Pega automated agent step** stalls at "Waiting for Agent to process".
- `Channel`, `SessionContext` and `Consent.ConsentName` do not persist in Pega.

## 10. Outstanding actions

1. **Rotate credentials.** The GitHub PAT (very broad scopes), the Pega client
   secret and the AWS access key have all appeared in working transcripts.
2. **Set a budget alarm.** Bedrock now serves public traffic.
3. Consider putting the public URL behind access control — it is currently open.

---

Related: [agentic-architecture-plan.md](./agentic-architecture-plan.md) ·
[pega-integration-guide.md](./pega-integration-guide.md) ·
[deployment-amplify.md](./deployment-amplify.md) ·
[adapter-interface.md](./adapter-interface.md)
