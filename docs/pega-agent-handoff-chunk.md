# Handoff to Pega team — `chat_onboarding` never populates `AIAgentPrompt`

## Problem

The external app calls the Pega REST service `ServicePAL.Rest.Inbound_API_Service_Package.v1.chat_onboarding`, which runs activity `ODHMNT-AgenticC-Data.InvokeAgentChat`. The interaction completes without error, but the AI agent (`pxConnectToAIAgent`, agent instance `UnifiedCustomerOnboarding`) is called with an **empty `AIAgentPrompt`** every time. Pega's own connector guard trips (`pyMessageLabel = pzAgentPromptEmpty`, `pzStatus = false`), `ChatReply`/`ChatHistory` never get populated, and the conversation can never reach the "Begin application" branch that would start a case. There is no exception anywhere in the trace — this is a silent no-op, not a crash.

## Where to look

1. **`chat_onboarding` REST Service Package (v1) request data mapping** — confirm what property on the primary page (`ODHMNT-AgenticC-Data`) is supposed to receive the inbound user message text. In the trace below, the primary page never contains any such property, from the very first step of `InvokeAgentChat` onward — only `pxObjClass` / `pzStatus`.
2. **`ODHMNT-AgenticC-Data.BuildAgentChatRequest`** (data transform, step 1 of `InvokeAgentChat`) — it currently only sets `ChatSchemaVersion` (default `1.0`) and `ChatIndustryCode` (default `BANKING`), plus an empty `For Each Page In` loop over `ChatHistory`. It never sets anything that becomes `AIAgentPrompt`.
3. **The `Call pxConnectToAIAgent` step** (step 2 of `InvokeAgentChat`) — check its parameter mapping for `Param.AIAgentPrompt`. `AIAgentInsName` is populated correctly (`UnifiedCustomerOnboarding`); `AIAgentPrompt` is not.

## What the external app currently sends (for reference)

`POST` to the configured Pega assistant endpoint, JSON body:

```json
{
  "caseId": "<string, optional>",
  "industryCode": "BANKING",
  "message": "<the customer's chat text>",
  "history": [{ "role": "customer|assistant", "content": "..." }],
  "conversationId": "<string, optional>",
  "sessionId": "<string, always present>",
  "schemaVersion": "1.0"
}
```

This shape was written speculatively before the channel could be tested end-to-end, so the field name `message` is a guess, not a confirmed contract. **Please confirm the exact field name(s) the `chat_onboarding` service mapping expects**, so the app side can be aligned.

## Condensed event flow (sequence 216–267, full `InvokeAgentChat` interaction)

```
seq=216 | Activity Begin | InvokeAgentChat
seq=217 | Step Begin      | step=1 Apply-DataTransform (BuildAgentChatRequest)
seq=218-232                data transform body: sets ChatSchemaVersion, ChatIndustryCode; empty For-Each over ChatHistory
seq=233 | Data Transform End | BuildAgentChatRequest — primary page still has no message property
seq=234 | Step End        | step=1 GOOD
seq=235 | Step Begin      | step=2 Call pxConnectToAIAgent
seq=236 | Activity Begin  | pxConnectToAIAgent — Param.AIAgentInsName=UnifiedCustomerOnboarding, Param.AIAgentPrompt=""
seq=237-240                Page-Clear-Messages (skipped, no messages)
seq=241-244                Page-Set-Messages step 2 (AIAgentInsName check, not empty, skip)
seq=245                    Page-Set-Messages step 3 begins
seq=246-247   *** When: Param.AIAgentPrompt=="" evaluates TRUE ***
seq=250       *** Step End: pzStatus set to "false", pyMessageLabel=pzAgentPromptEmpty ***
seq=251 | Activity End    | pxConnectToAIAgent
seq=252 | Step End        | step=2 GOOD (call itself succeeded — pzStatus=false is a business flag, not a step failure)
seq=253-258                NewConvID / other Property-Set steps, all skipped or no-op
seq=259-262                When: contains(.ChatReply, "Begin application") — ChatReply is empty, no match
seq=263-266                When: ChatIndustryCode != "" && LengthOfPageList(.ChatHistory) > 2 — ChatHistory is empty, no match
seq=266                    ChatHistory <ChatHistory REPEATINGTYPE="PageList" />  — literally empty
seq=267 | Activity End    | InvokeAgentChat — interaction ends, no case ever started
```

## Raw trace excerpts (smoking gun)

```xml
<!-- seq 236: entering pxConnectToAIAgent — AIAgentPrompt already empty -->
<TraceEvent sequence="236" eventType="Activity Begin" keyname="@baseclass pxConnectToAIAgent" ...>
  <PrimaryPageContent><pagedata><pxObjClass>ODHMNT-AgenticC-Data</pxObjClass><ChatSchemaVersion>1.0</ChatSchemaVersion><ChatIndustryCode>BANKING</ChatIndustryCode><pzStatus>valid</pzStatus></pagedata></PrimaryPageContent>
  <ParameterPageContent><pagedata><AIAgentResponse></AIAgentResponse><NewConvID></NewConvID><AIAgentInsName>UnifiedCustomerOnboarding</AIAgentInsName><ContextID></ContextID><ConvID></ConvID><AIAgentPrompt></AIAgentPrompt></pagedata></ParameterPageContent>
</TraceEvent>

<!-- seq 246: the connector's own guard condition fires -->
<TraceEvent sequence="246" eventType="When Begin" stepMethod='Param.AIAgentPrompt==""' keyname="@baseclass pxConnectToAIAgent" .../>

<!-- seq 250: guard result — pzStatus flipped to false, pyMessageLabel set -->
<TraceEvent sequence="250" eventType="Step End" stepStatus="GOOD" keyname="@baseclass pxConnectToAIAgent" ...>
  <PrimaryPageContent><pagedata><pxObjClass>ODHMNT-AgenticC-Data</pxObjClass><ChatSchemaVersion>1.0</ChatSchemaVersion><ChatIndustryCode>BANKING</ChatIndustryCode><pzStatus>false</pzStatus><PZ__>[ODHMNT-AgenticC-Data.pyMessageLabel]pzAgentPromptEmpty</PZ__></pagedata></PrimaryPageContent>
  <ParameterPageContent><pagedata><AIAgentResponse></AIAgentResponse><NewConvID></NewConvID><AIAgentInsName>UnifiedCustomerOnboarding</AIAgentInsName><ContextID></ContextID><ConvID></ConvID><AIAgentPrompt></AIAgentPrompt></pagedata></ParameterPageContent>
</TraceEvent>

<!-- seq 266: end of interaction — ChatHistory still completely empty -->
<TraceEvent sequence="266" eventType="Step End" keyname="ODHMNT-AgenticC-Data InvokeAgentChat" ...>
  <PrimaryPageContent><pagedata><pxObjClass>ODHMNT-AgenticC-Data</pxObjClass><ChatSchemaVersion>1.0</ChatSchemaVersion><ChatConfidence>0.9</ChatConfidence><ChatIndustryCode>BANKING</ChatIndustryCode><pzStatus>false</pzStatus><PZ__>[ODHMNT-AgenticC-Data.pyMessageLabel]pzAgentPromptEmpty</PZ__><ChatHistory REPEATINGTYPE="PageList" /></pagedata></PrimaryPageContent>
</TraceEvent>
```

## Ask

Please confirm:
1. The exact inbound JSON field name (or existing service mapping) that should carry the user's chat message text into a primary-page property.
2. Whether `BuildAgentChatRequest` (or the `Call pxConnectToAIAgent` step's parameter mapping) is supposed to copy that property into `Param.AIAgentPrompt`, and whether that step is currently wired up at all.

Once confirmed, the external app's request body will be updated to match.
