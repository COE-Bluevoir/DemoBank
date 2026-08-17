# Pega Conversational Agent — Trace Diagnosis (2026-08-14)

## Symptom

The conversational agent connecting the external app to the Pega agent (`chat_onboarding` service) does not progress — no case gets created, no MCP tool calls fire.

## Source

Pega tracer export, interaction on `ODHMNT-AgenticC-Work`, service `ServicePAL.Rest.Inbound_API_Service_Package.v1.chat_onboarding`, activity `ODHMNT-AgenticC-Data.InvokeAgentChat` (268 events, sequence 0–267).

## Root cause

`AIAgentPrompt` is empty every time `pxConnectToAIAgent` (Pega's built-in GenAI agent connector) is called, so the agent is invoked with nothing to respond to.

Trace evidence, in order:

1. **Activity Begin, `InvokeAgentChat` (seq 216–217)** — primary page (`ODHMNT-AgenticC-Data`) already contains only `pxObjClass` and `pzStatus=valid`. No property resembling a user message exists at the very start of the activity.
2. **`BuildAgentChatRequest` data transform (seq 218–233)** — sets `ChatSchemaVersion=1.0` and `ChatIndustryCode=BANKING` (default-if-empty pattern). No step sets a message/prompt value. A `For Each Page In` step (over `ChatHistory`) runs but has nothing to iterate — `ChatHistory` is an empty page list for the entire interaction.
3. **`Call pxConnectToAIAgent` (seq 235–236)** — parameter page shows `AIAgentInsName=UnifiedCustomerOnboarding` but `AIAgentPrompt=""`.
4. **`pxConnectToAIAgent` step 3, `Page-Set-Messages` (seq 245–250)** — the connector's own guard condition `Param.AIAgentPrompt==""` evaluates true. It sets `pyMessageLabel = pzAgentPromptEmpty` and `pzStatus=false` on the primary page.
5. **Through the rest of the interaction (seq 252–266)** — `pzStatus` stays `false`, `pyMessageLabel=pzAgentPromptEmpty` persists, `ChatReply`/`ChatHistory` never get populated. The `contains(.ChatReply, "Begin application")` check (seq 260) and the `LengthOfPageList(.ChatHistory) > 2` check (seq 264) both operate on empty data, so the flow never advances toward case creation.

**Conclusion:** the inbound JSON body from the external app is not landing on the primary page under any property name the Pega side reads. The agent call itself, the case-creation gating, and the MCP tool sequence are never reached — the interaction silently no-ops on `pzAgentPromptEmpty` every turn.

## What's unverified

Which property the `chat_onboarding` REST Service Package's request data mapping is *supposed* to populate with the user's message text. That mapping lives in Pega Dev Studio, not in this repo, and wasn't inspected as part of this trace.

## Cross-check against this repo

[`src/lib/assistant/pega-provider.ts:46-64`](../src/lib/assistant/pega-provider.ts#L46-L64) sends the user's text as JSON field `message`, alongside `caseId`, `industryCode`, `history`, `conversationId`, `sessionId`, `schemaVersion`. That shape was written speculatively — the file's own comment notes Pega's conversational channel wasn't exposed yet, so it "cannot be exercised end to end" ([lines 9-19](../src/lib/assistant/pega-provider.ts#L9-L19)). This trace is the first real evidence against that guess, and it shows the guess doesn't reach the primary page under the name `message` (or under any name).

## Recommended next step

Whoever owns the `chat_onboarding` Service Package in Pega Dev Studio should check the request data mapping (and/or `BuildAgentChatRequest`) for the exact property name expected to carry the user's message text, so `pega-provider.ts`'s request body can be aligned to it.
