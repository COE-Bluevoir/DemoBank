# Pega MCP Service — Verified Findings

**For:** Pega application team, `AgenticC` / `agentic-customer-onboarding`
**From:** NorthStar Bank onboarding website (the digital channel)
**Last verified:** 2026-08-04

**Status:** Changes 1 and 2 are confirmed working. The MCP service is reachable
and 12 tools are enumerable. Three issues remain — two MCP tools fail
server-side, and a data-model question needs a decision.

---

## 1. Confirmed fixed

### Change 1 — operator binding on the OAuth client ✅

The client-credentials token now carries a real operator as its subject:

```
sub = Harshit.Kandimalla@bluevoir.com    app_name = AgenticC    access = AgenticC:Authors
```

Previously the subject was the client ID itself and session creation failed.
The MCP handshake now succeeds:

```
POST .../mcp/ODHMNT-AgenticC-Work-CustomerOnboardingUnified!Unity
→ HTTP 200, Mcp-Session-Id: PXCONV-371001
→ serverInfo: {"name":"Pega MCP Server","version":"01-01-01"}
→ capabilities: {"tools":{"listChanged":false}}
```

### Change 2 — `Utility1` in `CaptureDetails_Flow` ✅

Case `C-193026` was driven through every flow action. It now passes
`CaptureProductSelection` — previously the case fell into `ResumeProblemFlow`
here every time, including with an empty payload.

```
step 1  CreateCaseRecord            -> submitted (Initiate)
step 2  CaptureProductIntent        -> submitted (Initiate)
step 3  ProvideConsent              -> submitted (Initiate)
step 4  CollectIdentityInformation  -> submitted (Capture Details)
step 5  CollectContactDetails       -> submitted (Capture Details)
step 6  CollectAddress              -> submitted (Capture Details)
step 7  CaptureEmploymentInfo       -> submitted (Capture Details)
step 8  CaptureProductSelection     -> submitted (Capture Details)   <-- was broken
step 9  UploadIdentityDocument      -> submitted (Verify Identity)
step 10 UploadAddressDocument       -> submitted (Verify Identity)

FINAL: stage=Verify Identity  action=ReviewDocumentData  — no problem flow
```

The journey now reaches **Verify Identity → ReviewDocumentData**.

## 2. Tool inventory

Twelve tools are exposed. Status against the onboarding journey:

| Tool | Status | Notes |
| --- | --- | --- |
| `Create_Customer_Onboarding_Case` | ✅ works | Created `C-193025`. Takes `StartingFields`. |
| `Perform_Customer_Onboarding_Case_Assignment` | ✅ works | Advanced Initiate → Capture Details. Requires `CaseID` + `AssignmentContent`. |
| `pyGetCaseData` | ⚠️ returns `{}` | No case-context parameter; unclear how to scope it. |
| `Case_history` | ⚠️ returns 0 results | Same — no case-context parameter. |
| `Semantic_Search_EnumList_Field` | not exercised | For reference-field lookup. |
| `Change_Case_Stage` | not exercised | |
| `Get_pulse_details` | not exercised | |
| `SendEmailWithAttachments` | not exercised | |
| `pxChatWithYourData` | not exercised | |
| `pxCreateCaseFromEmail` | not exercised | |
| **`CreateandAttachPDF`** | ❌ **fails** | See issue 3.1 |
| **`Document_Extraction_Agent`** | ❌ **fails** | See issue 3.2 |

`AssignmentContent` uses **dot notation** for nested values
(`{"Address.City":"NYC"}`), not nested objects — different from the DX API.

## 3. Outstanding issues

### 3.1 `CreateandAttachPDF` — `Database-BadClassDef`

```json
{"name":"CreateandAttachPDF",
 "arguments":{"PDFName":"NorthStar_Onboarding_Summary","InputText":"..."}}

→ {"content":[{"type":"text","text":"[{\"message\":\"Database-BadClassDef\"}]"}],
   "isError":true}
```

A class referenced by the PDF generation rule is not defined in the database.
This blocks generating and attaching a document through MCP.

### 3.2 `Document_Extraction_Agent` — unhandled exception

```json
{"name":"Document_Extraction_Agent","arguments":{"ContextObjectID":"C-193026"}}

→ {"content":[{"type":"text","text":"[{\"message\":\"Implementation resulted in an exception\"}]"}],
   "isError":true}
```

Run against `C-193026`, which had already passed both document-upload steps.
This is the tool that would extract first name, last name, date of birth,
document number and address with a confidence score — the actual document
verification behind the journey. Without it, uploaded documents are stored but
never read.

### 3.3 `Applicant` is a reference, not inline data — please confirm intent

`Applicant` is not a set of fields on the case. It is a **reference to an
existing `Data-Applicant` record**, presented as a selectable list:

```json
"Applicant": {
  "description": "Selectable options for field 'Applicant'. When submitting, send an
                  OBJECT copied exactly from enumList[i].ValueFields",
  "enumList": [
    {"key":"5675e479-...","Label":"[{\"ApplicantName\":\"Marcus Chen\"}]",
     "ValueFields":{"pyGUID":"5675e479-..."}},
    {"key":"d6d4b46b-...","Label":"[{\"ApplicantName\":\"Rajesh Kumar Patel\"}]", ...}
  ]
}
```

This is a significant design point for a public onboarding channel. A new
customer applying online **does not already exist** as a `Data-Applicant`
record, so there is nothing valid to select. The website needs one of:

1. a way to **create** a `Data-Applicant` record as part of the journey and
   link it to the case, or
2. applicant fields written **inline** on the case (first name, last name, date
   of birth, email, mobile, employment status, income range, tax residency,
   and structured address components).

Please advise which is intended. The same question applies to `Address`,
`Consent` and `Document`, which follow the same reference pattern.

### 3.4 `Channel` and `SessionContext` still not persisting

Both are accepted on `CreateCaseRecord` and echoed back as `x-currentValue`,
but read back empty from the case afterwards. Verified via control requests made
directly against Pega, bypassing our application. `Execution[]` behaves the
same way on `CollectAddress`.

`Execution[].CorrelationID` is the intended hook for tying a Pega-side trace to
a request in the website's logs, so this one has real operational value.

## 4. Data model gap (unchanged)

The website collects 14 applicant fields. The case can currently store two:
the composed applicant name and a single-line address. Date of birth,
nationality, mobile, email, employment status, income range and tax residency
have no property to land in.

The website already sends `FirstName`, `LastName`, `DateOfBirth`, `Email`,
`Mobile`, `EmploymentStatus`, `IncomeRange`, `TaxResidency` and structured
address components on every submission. They are filtered out at the boundary
because no view exposes them. **Add the properties and they populate
automatically — no website change required.**

## 5. Next steps on our side

Once 3.1–3.3 are resolved we will:

1. Add an MCP-backed adapter behind the website's existing
   `OnboardingOrchestrationAdapter` interface, selectable by configuration
   alongside the current DX adapter — no change to routes or UI.
2. Use `Document_Extraction_Agent` for real document verification instead of
   treating upload as implicit acceptance.
3. Carry the correlation ID into `Execution[]` for end-to-end tracing.

---

**Reproduction environment:** `bv-infax-261.pegademo.com`, app alias
`agentic-customer-onboarding`, case type
`ODHMNT-AgenticC-Work-CustomerOnboardingUnified`.
DX-side contract: [pega-integration-guide.md](./pega-integration-guide.md).
