# Handoff to Pega team — a small, real Pega-backed example for the governance demo

## Why

The app has a small marketing demo (`/accelerator/governance`) that asks the same
question two ways: a raw LLM with no guardrails, and a "grounded" answer. Today
the grounded side reads from a static config file in the app — it's correct,
but it isn't Pega doing anything, and a technically literate audience will
notice. Rather than keep implying Pega when it isn't involved, we want the
grounded side to be a genuine, live read from Pega — small and boring on
purpose, so it's easy to build and impossible to get wrong.

## The example

Two questions, both already in the demo:

1. "What documents do I need to open a business account?"
2. "What is the interest rate on the Everyday Plus Account?"

The honest, demonstrable point: an ungrounded model invents a document list
and a specific interest rate. The real answer, read live from Pega, has the
correct document list — and **no interest rate at all**, because none of
these products carry a published rate. That second fact is the more
convincing one precisely because it isn't flattering — the demo shows Pega's
data correctly having nothing to say, not just correctly having the right
answer.

## What we need built

**One new Data Page**, e.g. `D_ProductCatalog`, with three rows — the same
three products already live in the app and (assuming `CreateCaseRecord`
carries `ProductIntent`) already familiar from real cases:

| ProductCode | ProductName | RequiredDocuments | InterestRate |
|---|---|---|---|
| `EVERYDAY_PLUS` | Everyday Plus Account | Certificate of incorporation; Authorised signatory identity; Board resolution; Tax registration certificate; Business address proof | *(blank)* |
| `BUSINESS_GROWTH` | Business Growth Account | *(same five)* | *(blank)* |
| `MERCHANT_COLLECTIONS` | Merchant Collections Account | *(same five)* | *(blank)* |

The five documents are exactly `banking.ts`'s existing `documentProfile` list
— nothing new to define, just re-entered as reference data. `InterestRate`
is deliberately left blank for all three; that's a real fact, not a gap to
fill in.

**Exposed for read access via the DX API** — however your team normally
exposes a Data Page for REST retrieval (a `GET` against the Data Page, or a
thin custom endpoint wrapping it, whichever is the standard pattern on this
instance). We don't need write access, case-instance binding, or anything
tied to a specific case — this is pure reference data, queried independent
of any running case, which is what keeps the demo reliable regardless of
what any live case is doing.

## What we need back from you

Once it exists:

1. The exact request — path, method, and whether it needs a case type or
   any other parameter in the URL/query.
2. The exact response shape (field names as returned, not just as modeled).
3. Confirmation it authenticates with the same OAuth2 client-credentials
   this app already uses for the DX API (`PEGA_CLIENT_ID`/`PEGA_CLIENT_SECRET`
   against `PEGA_TOKEN_URL`) — we'd rather not provision a second credential
   pair for one read-only lookup.

## What changes on the app side once this exists

`src/lib/agents/hallucination-demo.ts` currently answers the "grounded" side
from the local `OnboardingAssistantProvider`, which reads the industry pack.
That gets replaced with a live call to this Data Page, and the UI's
"Grounded on:" line changes from naming a local config file to naming the
live Pega response — at which point the label "Pega" in this demo becomes
literally true instead of aspirational.
