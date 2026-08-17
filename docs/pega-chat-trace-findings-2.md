# Pega Conversational Agent — Trace Diagnosis, Round 2 (2026-08-14)

## Source

A new tracer export (`H8XL5SEQYCJCRB0FUI5I23SDNRUR1AAN3A.xml`, 1296 events, sequence 0–1295) containing **two separate interactions** against the same service, about 26 minutes apart:

| | RequestorID | Time (GMT) | ChatSessionID | Outcome |
|---|---|---|---|---|
| Interaction 1 | `A851A459...` | 07:52:34 | `diag-live-1786693954403` | Same failure as [the first trace](pega-chat-trace-findings.md) — `AIAgentPrompt` empty |
| Interaction 2 | `AAD85801...` | 08:18:29 | `diag-live-1786695509310` | `AIAgentPrompt` populated correctly, reaches the real GenAI agent call, fails differently |

Both calls hit `ServicePAL.Rest.Inbound_API_Service_Package.v1.chat_onboarding` → activity `ODHMNT-AgenticC-Data.InvokeAgentChat`, with `message: "Hi, I want to open an account"` sent as an HTTP header (matching the header-based mapping [`pega-provider.ts`](../src/lib/assistant/pega-provider.ts#L54-L66) now uses, per its own comment about `chat_onboarding`'s Request > Headers configuration).

## Finding 1 — the original root cause is fixed, and the trace proves why

**Inbound mapping now succeeds** (seq 149–166, "Mapping End" `status="Success"`): the `message` header lands on the primary page as `ChatMessage`, alongside `ChatSessionID` and `ChatIndustryCode`.

But interaction 1 still loses it. Its `InvokeAgentChat` activity starts step 1 as `Apply-DataTransform` directly (seq 402) — **there is no `Page-Copy` step**. By the time `BuildAgentChatRequest` and `pxConnectToAIAgent` run, the primary page (`pyWorkPage`) has only `ChatSchemaVersion` / `ChatIndustryCode` / `pzStatus` — `ChatMessage` never made it there. `AIAgentPrompt` ends up empty, the connector's own guard fires (`Param.AIAgentPrompt==""` → `pyMessageLabel=pzAgentPromptEmpty`), exactly as in [the first trace](pega-chat-trace-findings.md).

Interaction 2's `InvokeAgentChat` starts with an *extra* step 1: `Page-Copy` (seq 639–640), **then** `Apply-DataTransform`. With that step present, `ChatMessage` survives onto `pyWorkPage`, `BuildAgentChatRequest` carries it through, and `Param.AIAgentPrompt==""` correctly evaluates `False` (seq 667) with `AIAgentPrompt = "Hi, I want to open an account"`.

**Conclusion: someone added a `Page-Copy` step to `InvokeAgentChat` between these two calls, and it fixed the inbound data-loss bug.** The activity now proceeds past the connector guard into `Call-Automation` → `Pega-API-AI-Agent.pxInitiateSubAgentConversation` — real progress that interaction 1 (and the original trace) never reached.

## Finding 2 — new blocker: the AI Agent instance isn't found

In interaction 2, once `pxInitiateSubAgentConversation` runs (seq 772–1240) with `agentID=UnifiedCustomerOnboarding`, `pxConnectToAIAgent` ends with:

```xml
<pzStatus>false</pzStatus>
<PZ__>(ODHMNT-AgenticC-Data)Agent not found</PZ__>
```

(seq 1259). The GenAI plumbing itself runs without exception (`pzInitiateGenAIConversationImpl`, `pzLogAITraceEventBegin/End`, `pzLogAgentPDCAlert` all complete `GOOD`), but the agent instance named **`UnifiedCustomerOnboarding`** cannot be resolved — `response` stays empty. `ChatReply` therefore never gets a real answer.

**Confirmed cause:** `UnifiedCustomerOnboarding` is not an AI Agent record at all — it's a UI harness/component name under class `ODHMNT-AgenticC-UIPages`. The trace shows it 179 times, almost all as:

- `pyRuleName=CustomerOnboardingUnifiedPage`, `pyClassName=ODHMNT-AgenticC-UIPages`, `pyLabel="Customer Onboarding (Unified)"` — a `Rule-HTML-Harness`
- `pyCoach=UnifiedCustomerOnboarding`, `pyPromptClass=ODHMNT-AgenticC-UIPages`, `pyComponentName=AIAgentObject` — a UI widget (an "AI Agent" component dropped onto a page in App Studio), picked up while building the portal's navigation menu
- Referenced from `pxReferredFromClass=Rule-UI-View-LandingPage`, `pyLabel="AgenticC App Agent Landing Page"`

So `AIAgentInsName=UnifiedCustomerOnboarding` is pointing `pxInitiateSubAgentConversation` at a case-page component instead of the actual GenAI Agent rule — hence "Agent not found." The real agent record is presumed to be named `CustomerOnboardingAgent` (not seen anywhere in this trace — confirm the exact name in Dev Studio's Agentic AI / AI Agent list before using it).

The value isn't computed anywhere in the trace — it's already set the instant `pxConnectToAIAgent` begins, in both interactions, so it's a **literal value in the `Call pxConnectToAIAgent` step's parameters** inside `InvokeAgentChat` (step 2), not read off the clipboard.

## Finding 3 — new blocker, independent of Finding 2: the response mapping is broken on *every* call

This is the one that matters most, because it fails regardless of whether Finding 2 gets fixed.

`Outbound Map End` fails on **both** interactions:

```
seq 456  Outbound Map End  status="Failure"   (interaction 1)
seq 457  Service End       status="Failure"
seq 1294 Outbound Map End  status="Failure"   (interaction 2)
seq 1295 Service End       status="Failure"
```

The response mapping (`InvokeAgentChat`'s response conditions) is configured to read these clipboard paths off the primary page:

| Reads from | Maps to JSON field |
|---|---|
| `.message` | `chatreply` |
| `.suggestions` | `chatsuggestions[]` |
| `.confidence` | `chatconfidence` |
| `.ChatConversationID` | `conversationid` |

**None of `.message`, `.suggestions`, or `.confidence` exist on `ODHMNT-AgenticC-Data`.** The activity's own logic references `.ChatReply` directly — seq 1277: `@(Pega-RULES:String).contains(.ChatReply, "Begin application")` — and the first trace's findings doc showed `.ChatConfidence` on the page too. The response mapping was wired to the wrong property names (missing the `Chat` prefix), so it fails to build a response every single time, independent of whether the agent call inside succeeds. The one value that did get computed came out as `<chatreply>[, ]</chatreply>` — a broken/empty array-join artifact, not real content.

**There's also a second-order mismatch worth fixing at the same time:** even if the mapping pointed at the right properties, the JSON field names it produces (`chatreply`, `chatsuggestions[]`, `chatconfidence`, `conversationid`) don't match what [`pega-provider.ts`](../src/lib/assistant/pega-provider.ts#L94-L105) reads (`message`, `suggestions`, `confidence`, `conversationId`). Align on one contract — either the app changes what it reads, or the mapping's output parameter names change to match.

## Open question: who's calling this?

Both `ChatSessionID`s use a `diag-live-<epoch-ms>` prefix that doesn't appear anywhere in this repo (checked `pega-provider.ts`, `route.ts`, `assistant-chat.tsx` — nothing generates that format). The request `user-agent` is `node`, consistent with Node's default `fetch()` header, but the session ID itself points at an external test client (Pega's own connectivity tester, or a manual script) rather than the deployed app. Worth confirming with whoever ran these two calls, since it affects whether this trace reflects real app traffic or a manual diagnostic pass.

## What to do in Pega Dev Studio

Three separate fixes, in priority order (do #1 first — nothing else matters to the caller until it's fixed):

### 1. Fix the response mapping (`chat_onboarding` Service Package)

This is why the service returns a failure on *every* call, even a hypothetically perfect one.

1. Dev Studio → search for **`chat_onboarding`** (or Records → Integration-Resources → Service REST → `Inbound_API_Service_Package` → `v1` → `chat_onboarding`).
2. Open the **Response** tab for the mapping tied to activity `InvokeAgentChat` (the default response condition).
3. In the response mapping rows, change the "map from" property reference for each field:
   - `chatreply` — currently `.message` → change to **`.ChatReply`**
   - `chatconfidence` — currently `.confidence` → change to **`.ChatConfidence`**
   - `chatsuggestions[]` — currently `.suggestions` → find the actual property `InvokeAgentChat`/`BuildAgentChatRequest` sets for suggestions (open those rules and check what gets written after the agent responds — it won't be `.suggestions`) and point at that instead
   - `conversationid` — currently `.ChatConversationID` — this one's already named correctly; leave it, but confirm the activity actually sets `.ChatConversationID` somewhere (it wasn't populated in either interaction in this trace, likely because the flow never got that far)
4. While you're there, decide the JSON key names: either keep `chatreply`/`chatsuggestions[]`/`chatconfidence`/`conversationid` and tell the app team to read those, or rename the output parameters to `message`/`suggestions`/`confidence`/`conversationId` to match what [`pega-provider.ts`](../src/lib/assistant/pega-provider.ts#L94-L105) already expects (less work overall — one rule change vs. an app change).
5. Save and check in.

### 2. Fix the agent instance name (`InvokeAgentChat` activity)

1. Dev Studio → search for **`InvokeAgentChat`** (class `ODHMNT-AgenticC-Data`).
2. Open step 2, **`Call pxConnectToAIAgent`**, and expand its parameters.
3. Find the `AIAgentInsName` parameter — it's currently the literal string `UnifiedCustomerOnboarding`.
4. First, confirm the real agent's exact name in Dev Studio's **Agentic AI → AI Agents** list (or wherever `CustomerOnboardingAgent` is showing up for you) — it must match exactly, case-sensitive, for the lookup to resolve.
5. Replace the literal value with the confirmed name (presumed `CustomerOnboardingAgent`).
6. Save and check in.

### 3. Re-trace to confirm

Run the same test call again with Tracer open (or the Live UI/connectivity tester), and check for, in order:
- `Inbound Map End` → `Success`
- `AIAgentPrompt` populated on the `Call pxConnectToAIAgent` step
- `pxConnectToAIAgent` ends with `pzStatus=valid` (no `PZ__` "Agent not found")
- `pxInitiateSubAgentConversation` / `pzInitiateGenAIConversationImpl` complete `GOOD` with a non-empty `response`
- `Outbound Map End` → `Success` (this is the one that's failed on every call so far — watch it specifically)
- `Service End` with no `Failure` status

If all of those hold, the response the caller gets back should finally contain a real `ChatReply`.
