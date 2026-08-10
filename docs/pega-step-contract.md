# Pega step contract — as observed

Case type `ODHMNT-AgenticC-Work-CustomerOnboardingUnified`, verified against
`bv-infax-261.pegademo.com` on 2026-08-10 by walking a case through the DX API
directly, with no application code involved.

Two sources disagree, and it matters which one you trust:

- **The data model document** lists every property a data object *defines*.
- **The flow action's own view** lists the properties that action *accepts*.

The view wins. A property that exists in the data model but is absent from the
action's view is rejected — and rejection fails the entire submission, not just
that field. This application therefore reads each action's view and filters
every submission down to it, rather than sending what the model documents.

## The lifecycle

```
1. Initiate          Create Case Record → Capture Product Intent → Provide Consent
                     → Consent Validation → next stage
2. Capture Details   Capture Employment Info → Collect Identity Information
                     → Collect Contact Details → Collect Address
3. Verify Identity   Upload Identity Document → Upload Address Document
                     → extraction, comparison, mismatch handling
4. Perform Screening
5. Resolve Exceptions
6. Create Customer
7. Complete
```

## What each step accepts

| Flow action | Top-level content | Properties inside those pages |
|---|---|---|
| `CreateCaseRecord` | `ProductIntent`, `CustomerOnboardingName`, `AttachDoc` | — |
| `CaptureProductIntent` | *(nothing)* | — |
| `ProvideConsent` | `Consent`, `Channel` | `Consent.ConsentName` |
| `CaptureEmploymentInfo` | `EmploymentStatus`, `IncomeRange`, `TaxResidency` | *(all three are top-level, not on `Applicant`)* |
| `CollectIdentityInformation` | `Applicant`, `AttachDoc`, `Document` | `Applicant.ApplicantName`, `Document.{DocumentName, DocumentType, DocumentNumber}` |
| `CollectContactDetails` | `Address`, `Applicant` | `Applicant.ApplicantName`, `Address.AddressName` |
| `CollectAddress` | `Address`, `AddressDoc`, `Execution` | `Address.AddressName`, `Execution.{ExecutionName, AgentName, CorrelationID}` |
| `UploadIdentityDocument` | — | attachment property `UploadDocs` (list) |
| `UploadAddressDocument` | — | attachment property `AttachDoc` (single) |

Notable: the case type currently exposes far less than the data model defines.
There is no view that accepts `EmailAddress`, `MobileNumber`, `DateOfBirth`,
`StreetAddress`, `City`, `State`, `PostalCode` or `Country`, so those values
cannot reach Pega today however they are sent. This application maps them under
their documented names anyway; the moment a view exposes one, it populates with
no code change.

## Picklists

Read from the live views, and matched exactly by this application:

| Property | Values |
|---|---|
| `EmploymentStatus` | Salaried, Self-employed, Student, Other |
| `IncomeRange` | INR 0-5 / 5-10 / 10-15 / 15 lakh+ per annum |
| `TaxResidency` | India, United Kingdom, United States, Other |
| `DocumentType` | Passport, PAN card, Aadhaar card, Driver license, Voter ID, Utility bill, Bank statement, Other |

A value outside the list fails the whole submission, so answers are conformed to
the list the action actually declares before sending — the industry packs use
their own vocabulary and cannot be assumed to match.

## Attachments

An attachment must be cited **on the flow action**, not merely linked to the
case:

```json
{
  "content": { },
  "attachments": [
    { "type": "File", "category": "File", "ID": "<upload id>",
      "name": "file.pdf", "attachmentFieldName": "UploadDocs" }
  ]
}
```

Two details cost real time to discover:

1. The property differs per action — `UploadDocs` on the identity step,
   `AttachDoc` on the address step. It is read from the view's
   `@ATTACHMENT .Property` marker rather than hardcoded.
2. The leading dot in that marker must be **stripped** on submit. Pega publishes
   `.AttachDoc` and rejects `.AttachDoc`, accepting only `AttachDoc`.

The action view must be requested with `?viewType=form`; without it Pega may
return content only, and the attachment property cannot be discovered.

Uploaded files must be genuinely well-formed PDFs. Pega parses them, and a stub
that only satisfies magic-byte validation is rejected with a generic
"invalid input parameters" that reads like an integration fault.

## Open defect on the Pega side

`CollectAddress` cannot be completed by any DX API client. Every submission is
rejected with:

> Attachment content is empty, please upload at least one attachment to perform
> the action.

Verified on a case created and walked entirely through Pega's own API, with no
application code involved. All of the following fail identically:

| Attempt | Result |
|---|---|
| Exactly the properties its view declares, no attachment | 422 attachment empty |
| Same, plus an attachment cited on `AddressDoc` (the property its view declares) | 422 attachment empty |
| Same, plus `Execution` populated | 422 attachment empty |
| An attachment linked to the case first (confirmed present) | 422 attachment empty |
| Attachment cited as `SupportingDocument` / `Address.SupportingDocument` | 400 invalid attachment details |

`CaptureEmploymentInfo` showed the same symptom before it was fixed, and there
the cause was plainer: it demanded an attachment while declaring **no attachment
control at all** — only three dropdowns.

This also conflicts with the case type's own design: document upload happens in
stage 3 (Verify Identity), one stage *after* `CollectAddress` in stage 2. A
customer has not supplied any document at that point in the journey.
