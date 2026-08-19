# Handoff to Pega team — native `DemoModeEnabled` bypass

## Why

The external app currently fakes this from outside: it lets the real `CreateCaseRecord`/`ProvideConsent`/`CollectAddress` steps run normally, then — instead of waiting on the live extraction/screening agents — force-writes the outcome via `pyUpdateCaseDetails` and jumps the case's stage directly with `PUT /cases/{id}/stages/{stageID}`. It works, but it's a workaround with real costs:

- The live agent automation keeps running in the background after the app stops waiting on it, and routinely lands the case in the `FlowProblems` workbasket — stale, confusing clutter on an otherwise-successful case.
- Every write has to go through `pyUpdateCaseDetails`, which (see the field-shape note at the bottom) is far pickier than a real flow action's own view, so the app can only safely write a handful of fields.
- It's fragile by construction: it only works because the app happens to know which stage IDs and content shapes to force.

What we actually want: **Pega checks a flag at the top of each stage that would call a live agent, and short-circuits itself** — the same way the app already treats "documents required" as a real business state. The external app then just submits normal actions with normal data; no stage-jumping, no `pyUpdateCaseDetails` gymnastics.

## 1. Add the flag

- **Property**: `DemoModeEnabled` (Boolean), on `ODHMNT-AgenticC-Work-CustomerOnboardingUnified` (or wherever it inherits sensibly).
- **Expose it on `CreateCaseRecord`'s view** so it can be set once, at case creation. It doesn't need to be on any other action's view — it's a case property that persists once set, so later flow shapes read it straight off the clipboard (`.DemoModeEnabled`), not from anything resubmitted.
- This is the exact property name/shape we tried to send before or now — if you'd rather name it something else, that's fine, just tell me the final name and I'll match it. The only hard requirement is that **`CreateCaseRecord`'s view actually declares it** — the first attempt at this failed silently because no view accepted the field at all, and the DX API rejects any property a view doesn't declare.

## 2. Guard each live-agent call

Two spots, both known landmarks from tracing this case type's flow this week:

### Verify Identity stage (PRIM2) — Document Validation / extraction

Right where the flow currently calls the Document Extraction Agent (the step that's been timing out — this is the `Run Onboarding Orchestrator (Document Validation)` / `Utility1` shape from the problem-flow traces), add a `When` at the very top:

```
When .DemoModeEnabled == true
  → skip the live agent call entirely
  → run a data transform that writes the same shape the agent normally
    produces (see field list below)
  → continue the flow exactly as if the agent had returned successfully
Otherwise
  → existing behaviour, unchanged
```

### Perform Screening stage (PRIM3) — Screening Agent / Risk Agent

Same pattern, at the top of whatever currently calls the Screening/Risk agents (the `Utility3` decision shape that's been throwing the "declare page parameters not supported by PropertyReference" error). Guard it with the same `.DemoModeEnabled` check, write the screening outcome directly, continue the flow.

## 3. What the bypass path should write

So a demo-mode case looks identical to a real one regardless of which path produced it:

**At Document Validation (Verify Identity):**
- `Document[]` — `DocumentName`, `DocumentType`, `DocumentNumber` per document (already attached as real files by this point; this just needs to confirm/set their extracted metadata)
- `Execution[]` — one row per synthetic "agent step" (`ExecutionName`, `AgentName`, `CorrelationID`)
- Whatever else the real agent normally sets that isn't in this list — `MatchConfidence`, `ReasonCode`, `pyDocumentAgentExtractionResults`, anything on the case that a genuine extraction run populates. This is the one part only your side can specify correctly; the app's own workaround only ever wrote `Document`/`Execution` because those are the only fields confirmed safe to write externally.

**At Perform Screening:**
- `CheckResult[]` — `CheckResultName`, `CheckStatus` (picklist: `Passed`/`Failed`/`Pending`/`Needs review`), `CheckType` (picklist: `Sanctions`/`PEP`/`Duplicate customer`/`Document fraud`/`Blacklist`), `ConfidenceLevel`
- `Execution[]` — screening/risk agent audit rows, same shape as above

## 4. What I'll change once this exists

One line in `adapter.ts`: `createCase` sends `DemoModeEnabled: true` in the `CreateCaseRecord` submission when the presenter's toggle is on. Everything else — the stage-jump/mirror module (`scripted-drive.ts`, `scripted-narrative.ts`), the pacing markers, the problem-flow suppression flag — becomes dead code I'll delete. The app goes back to just submitting real actions and trusting Pega's own case state, which is the behavior we actually want.

## 5. Also worth fixing while you're in there (independent of the flag)

Found live this week, still outstanding:

- **Date-format validation** (`InvalidValueException: ... is not a valid date value`, `Document Validation`/`Utility1`): extracted dates like `14-03-2018` (DD-MM-YYYY) get rejected by a Date property expecting ISO 8601. Was reported fixed once, recurred on a later test — worth re-verifying against a fresh trace.
- **GenAI extraction non-determinism**: confirmed via side-by-side testing — identical input, different output across calls, for company name/DOB/PAN/GSTIN/addresses, while CIN and registration number stayed stable. Points at a prompt/context-anchoring issue rather than missing image bytes. This is the actual root cause the demo-mode flag works around; fixing it properly would make the flag optional rather than necessary.
- **`Utility3` PropertyReference error**: "declare page parameters not supported by PropertyReference" in Perform Screening — a Declare Page/PropertyReference misconfiguration, separate from the two issues above.
- **DocumentAgent tool description**: still describes individual KYC documents (Passport/DL/bank statement) instead of the actual business documents this journey collects (Certificate of Incorporation, Authorised Signatory ID, Board Resolution, Tax Registration Certificate, Business Address Proof). Corrected text was handed over earlier; not confirmed applied.

## 6. One platform quirk worth knowing regardless

`pyUpdateCaseDetails`'s `Applicant`, `Address`, and `Consent` fields are single-reference Combobox controls bound to a savable Data object by `pyGUID` — **not** embedded pages like `Document`/`CheckResult`/`Execution`. Confirmed live: this view accepts *only* the bare display-name property for each (`ApplicantName`, `AddressName`, `ConsentName`) — including any other sub-property (`FirstName`, `StreetAddress`, `ConsentType`, anything) causes the **entire PATCH to reject** with a generic `Error_Invalid_Inputs_content`, no field-level detail. This silently broke an existing app-side function (`syncCustomerOnboardingName`) that's been sending the fuller shape — just fixed on the app side by trimming to the display-name-only form, but flagging it in case it explains other integration oddities you've seen, or in case it's worth exposing a fuller `Applicant`/`Address` edit surface on that view.
