# Agentic Onboarding Architecture — Implementation Plan

**Status:** Plan. Nothing in this document is built yet.
**Date:** 2026-08-05

---

## 1. The shape

A conversational onboarding agent runs **outside** Pega on AWS Bedrock. It
answers what it can answer, delegates to specialist agents, and enters Pega
only when the interaction requires governed execution — creating a case,
advancing a stage, obtaining approval, activating a service.

```
                    customer (unstructured request)
                              │
                    ┌─────────▼──────────┐
                    │  Orchestrator      │   Bedrock AgentCore Runtime
                    │  agent             │   unstructured in → structured out
                    └─────────┬──────────┘
             ┌────────────────┼────────────────┐
             │                │                │
      ┌──────▼─────┐   ┌──────▼─────┐   ┌──────▼──────┐
      │ Policy     │   │ Document   │   │ Screening   │   specialist agents
      │ agent      │   │ agent      │   │ agent       │
      └──────┬─────┘   └──────┬─────┘   └──────┬──────┘
             └────────────────┼────────────────┘
                    ┌─────────▼──────────┐
                    │ AgentCore Gateway  │   HTTP tools → MCP tools
                    └─────────┬──────────┘
             ┌────────────────┼────────────────┐
      ┌──────▼─────┐   ┌──────▼─────┐   ┌──────▼──────┐
      │ Core       │   │ CIBIL /    │   │ KYC / AML   │   mock enterprise
      │ banking    │   │ bureau     │   │ screening   │   services
      └────────────┘   └────────────┘   └─────────────┘

                    only when governance is required
                              │
                    ┌─────────▼──────────┐
                    │  Pega              │   case, SLA, policy, approval,
                    │  (system of work)  │   exception, audit, activation
                    └────────────────────┘
```

The **dashboard** sits outside Pega and runs the same customer request down
both paths — agent-only and Pega-governed — showing where they diverge.

## 2. What already exists

This is not a greenfield build. The current codebase supplies:

| Needed | Already built |
| --- | --- |
| Mock enterprise services | 9 tool services at `POST /api/services/{tool}` with an allowlist, schema validation, idempotency and shared-secret auth |
| Tool discovery | `GET /api/services` returns the tool inventory |
| Two execution paths | `OrchestrationMode = mock-pega \| pega \| non-pega` behind one `OnboardingOrchestrationAdapter`; routes and UI are mode-agnostic |
| Pega integration | Working DX v2 adapter — OAuth, eTag concurrency, retries, document attachment, customer-safe error translation |
| Governance skeleton | `DemoExecutionEvent` with `CASE \| AGENT \| TOOL \| RULE \| HUMAN \| INTEGRATION`, correlation ID, status, technical details |
| Industry variation | Configuration packs for banking, insurance and telecom |
| Document storage | S3-backed storage plus an evidence-retrieval endpoint |
| AWS SDK | DynamoDB and S3 clients already wired |

The main gap is the agents themselves, and the AWS account to run them in.

## 3. Component design

### 3.1 Orchestrator agent

Receives the customer's unstructured message plus conversation history and the
active industry pack. Produces a **structured** decision:

```jsonc
{
  "intent": "OPEN_ACCOUNT | ASK_POLICY | PROVIDE_DETAILS | UPLOAD_DOCUMENT | CHECK_STATUS",
  "delegateTo": "policy | document | screening | none",
  "requiresGovernedExecution": true,        // does this need Pega?
  "customerResponse": "…",                  // plain text, safe to render
  "extractedFields": { … },                 // for the case, if any
  "confidence": 0.0–1.0
}
```

`requiresGovernedExecution` is the important field. A policy question is
answered by the policy agent and returned directly — no case, no Pega call. An
instruction to open an account crosses into Pega.

The orchestrator **never** decides eligibility, applies policy, or sets case
state. It routes and composes.

### 3.2 Specialist agents

| Agent | Responsibility | Grounded by |
| --- | --- | --- |
| Policy | Answer product, eligibility and process questions | Bedrock Knowledge Base per industry pack |
| Document | Classify uploads, extract fields, report confidence | Document tools via Gateway |
| Screening | Interpret sanctions, PEP, bureau and duplicate results | Screening tools via Gateway |
| Communication | Draft customer messages from approved templates | Template set per industry pack |

Each returns structured output. None owns state.

### 3.3 Mock enterprise services over MCP

The existing HTTP tool services become MCP tools through **AgentCore Gateway**,
which fronts an HTTP or Lambda target and exposes it as MCP. No rewrite — the
services keep their contracts, allowlist and idempotency.

Services to add per industry:

| Industry | Additional mock services |
| --- | --- |
| Banking | Core banking, CIBIL / credit bureau, sanctions, CRM |
| Insurance | Underwriting, policy administration, CRM |
| Telecom | Serviceability, provisioning, billing, CRM |

They follow the pattern already established: deterministic outputs, structured
responses, idempotency keys on anything with a side effect.

### 3.4 Compare-and-contrast dashboard

One customer request, two executions, rendered side by side:

| Dimension | Agent-only path | Pega-governed path |
| --- | --- | --- |
| Interpretation | ✅ | ✅ (same agent output) |
| Evidence and confidence | ✅ | ✅ |
| Durable case | ✗ | ✅ |
| Deterministic policy | ✗ | ✅ |
| SLA | ✗ | ✅ |
| Assignment and routing | ✗ | ✅ |
| Human approval | ✗ | ✅ |
| Exception handling | ✗ | ✅ |
| Audit trail | partial | ✅ |
| Activation | ✗ | ✅ |

The point is not that the agent path fails — it interprets well. It is that
interpretation without governed execution does not complete an enterprise
process.

### 3.5 Governance ledger

Every agent decision, inside or outside Pega, writes one record:

```jsonc
{
  "correlationId": "…", "caseId": "…", "industryId": "banking",
  "actor": "orchestrator | policy | document | screening | pega-rule | human",
  "modelId": "…", "modelVersion": "…",
  "promptTemplateId": "…", "promptVersion": "…",
  "packVersion": "…", "knowledgeBaseVersion": "…",
  "toolsInvoked": ["screen-pep"],
  "inputSummary": "…", "outputSummary": "…",
  "confidence": 0.62, "groundingStatus": "grounded | ungrounded",
  "guardrailResult": "passed | blocked",
  "requiresHumanReview": true,
  "caseStateBefore": "…", "caseStateAfter": "…",
  "latencyMs": 820, "timestamp": "…"
}
```

This extends the existing `DemoExecutionEvent` rather than replacing it. Stored
in DynamoDB alongside the case state already there.

## 4. AWS service mapping

| Purpose | Service | Notes |
| --- | --- | --- |
| Model access | Amazon Bedrock | Model choice per agent; cheap model for routing, stronger for extraction |
| Agent runtime | Bedrock AgentCore Runtime | Hosts orchestrator and specialists |
| Tool exposure | AgentCore Gateway | Turns existing HTTP tool services into MCP tools |
| Session state | AgentCore Memory | Conversation continuity across turns |
| Grounding | Bedrock Knowledge Bases | One per industry pack |
| Safety | Bedrock Guardrails | PII handling, refusal policy, grounding checks |
| Documents | S3 | Already implemented |
| Ledger and case state | DynamoDB | Already implemented |
| Observability | CloudWatch + AgentCore observability | Latency, cost, failure rates |

**Verify before committing to AgentCore:** confirm Runtime and Gateway are
available in the target region and that the account has model access. If
AgentCore is not available, the same design runs on Bedrock Converse with
tool-use plus a small orchestration service — the agent contracts do not
change. Treat AgentCore as an accelerator, not a dependency.

## 5. Phases

Each phase is independently demonstrable.

### Phase 0 — Prerequisites *(blocking)*

Nothing below can start without this. There are currently no AWS credentials
and no AWS CLI on the build machine.

#### How to hand over credentials

Preferred, in order:

1. **Local named profile.** Install the AWS CLI, then
   `aws configure --profile northstar-agents` (or `aws configure sso`). The
   application reads the default provider chain, so the secret never appears
   in a chat transcript, a file in the repo, or a command line.
2. **Temporary STS credentials.** An access key, secret and session token with
   a short expiry. Acceptable for a time-boxed build.
3. **Long-lived access keys.** Least preferred. If used, expect to rotate them
   afterwards.

Set `AWS_REGION` and `AWS_PROFILE`; do not put credentials in `.env.local`.

#### Console setup that cannot be done through the API

- **Bedrock model access must be explicitly enabled**, per model, in
  Bedrock → Model access. An account with valid credentials and no enabled
  models fails with `AccessDeniedException`. This is the single most common
  blocker.
- Confirm **Bedrock and AgentCore availability in the chosen region**.
- Set a **budget alarm** before any agent loop runs.

#### Permissions, granted per phase

**Phase 2 — orchestrator and policy agent**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeModels",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:Converse",
        "bedrock:ConverseStream"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/*"
    },
    {
      "Sid": "ApplyGuardrails",
      "Effect": "Allow",
      "Action": ["bedrock:ApplyGuardrail"],
      "Resource": "*"
    }
  ]
}
```

**Phase 2 — grounding (Knowledge Bases)**

- `bedrock:Retrieve`, `bedrock:RetrieveAndGenerate` on the knowledge base ARN.
- An S3 bucket for source documents.
- A vector store (OpenSearch Serverless is the default) plus an IAM **service
  role** the knowledge base assumes to read S3 and write to the vector store.
- To create knowledge bases from here rather than the console:
  `bedrock:CreateKnowledgeBase`, `bedrock:CreateDataSource`,
  `bedrock:StartIngestionJob`.

**Phase 3 — AgentCore Runtime and Gateway**

- Actions in the `bedrock-agentcore` namespace covering runtime creation and
  invocation, gateway creation and gateway targets, and memory.
- An **execution role** the AgentCore runtime assumes, permitted to invoke
  Bedrock models and reach the gateway targets.
- **ECR access** (`ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`,
  `ecr:PutImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`,
  `ecr:CompleteLayerUpload`) if the runtime is packaged as a container image.
- `iam:PassRole` limited to the execution role ARN.

> AgentCore is recent enough that its exact action names should be confirmed
> against current AWS documentation before the policy is finalised. For a
> time-boxed demo environment, the managed `AmazonBedrockFullAccess` policy
> plus the AgentCore managed policy is a faster starting point; tighten
> afterwards.

**Phases already covered by existing plans**

`DYNAMODB_TABLE_NAME` and `S3_DOCUMENT_BUCKET` with the least-privilege policy
in [deployment-amplify.md](./deployment-amplify.md).

**Observability**

`logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`.

#### Minimum to unblock Phase 2

An AWS account and region, one enabled Bedrock text model, credentials via a
named profile, and the `InvokeModels` statement above. Everything else can
follow.

### Phase 1 — Agent contracts and the seam

- Define orchestrator and specialist request/response schemas in Zod.
- Add an `AgentProvider` interface with two implementations: `deterministic`
  (today's mock behaviour) and `bedrock`.
- Wire the provider behind configuration, exactly as `STORAGE_DRIVER` works.

Deliverable: the app runs unchanged on the deterministic provider, with the
Bedrock seam in place and tested.

### Phase 2 — Orchestrator on Bedrock

- Implement the orchestrator agent with intent classification and the
  `requiresGovernedExecution` decision.
- Conversational surface on the industry site.
- Policy agent with a Knowledge Base for the banking pack.

Deliverable: a customer can ask a policy question and get a grounded answer
without a Pega case being created.

### Phase 3 — Tools over MCP

- Expose the 9 existing tool services through AgentCore Gateway.
- Add the banking mock services (core banking, CIBIL).
- Document and screening agents call them through MCP.

Deliverable: agents invoke enterprise services as MCP tools, with the tool
allowlist still enforced server-side.

### Phase 4 — Governed execution

- Orchestrator hands structured output to the existing Pega adapter when
  `requiresGovernedExecution` is true.
- Case creation, policy, assignment, approval and activation stay in Pega.

Deliverable: the full banking journey, driven conversationally.

### Phase 5 — Governance ledger and dashboard

- Extend the event model to the full record above; persist to DynamoDB.
- Governance console: per-interaction drill-down.
- Compare-and-contrast view running one request down both paths.

Deliverable: the demo's strongest proof point — how each decision was made,
and what governed execution adds.

### Phase 6 — Industry breadth

- Knowledge Bases and mock services for insurance and telecom.
- Prompt templates per pack.

Deliverable: the same agents adapting by configuration.

## 6. Design rules

1. **Agents never own state.** Case state, lifecycle and final decisions belong
   to Pega. Agents interpret and recommend.
2. **Structured output only.** No free text is parsed to drive a decision.
3. **The tool allowlist is server-side.** An agent cannot invoke a capability
   that is not registered, regardless of what the model produces.
4. **Every AI action is recorded** before its result is used.
5. **Customer-facing text comes from approved templates.** Screening
   vocabulary, provider names and reviewer notes never reach a customer — the
   boundary the current mapper already enforces.
6. **Deterministic fallback.** Every agent has a deterministic implementation
   so the demo runs if Bedrock is unavailable.

## 7. Open risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| No AWS credentials yet | Blocks all phases | Phase 0 |
| AgentCore regional availability | Design change | Converse + custom loop fallback; contracts unchanged |
| Pega data model still cannot store applicant detail | Phase 4 completes only to document verification | Tracked in `pega-mcp-integration.md`; mock-pega path completes end to end today |
| Pega automated agent step stalls | Journey stops at "Waiting for Agent to process" | Raised with the Pega team |
| Model cost and latency in a live demo | Poor demo experience | Cheap model for routing; cache policy answers; deterministic fallback |
| Non-determinism in a scripted demo | Unrepeatable runs | Low temperature, pinned model versions, recorded-response mode |

## 8. Decisions needed

1. **Conversational agent on Bedrock or Pega?** This plan puts it on Bedrock
   with Pega entered only when governance is required. Pega's own agent
   capabilities would invert that.
2. **AgentCore or Bedrock Converse?** Depends on regional availability.
3. **How much of the demo may be non-deterministic?** Affects model choice and
   whether responses are recorded for replay.
4. **Which industry gets Knowledge Base depth first?** Banking is assumed.

---

Related: [pega-integration-guide.md](./pega-integration-guide.md) ·
[pega-mcp-integration.md](./pega-mcp-integration.md) ·
[deployment-amplify.md](./deployment-amplify.md)
