# Handoff to Pega team — a small, real example of deterministic review decisioning

## Why

The governance demo currently proves grounding (a fact read instead of a
guess). That's real, but it's just retrieval — it doesn't show what Pega
actually differentiates on: a deterministic rule deciding something, the
same inputs always producing the same outcome, auditable.

The candidate question: **"Should this application be approved
automatically, or does it need human review?"** An ungrounded model will
improvise a plausible-sounding judgment call — which is worse than the
earlier hallucinations, because this is exactly the class of decision that
shouldn't be delegated to a model's opinion at all. The correct answer has
to come from an actual rule, not a better-grounded guess.

We already know this decision is real: a case with an address mismatch
lands on a "pending review" assignment (stage PRIM4) today — something is
already deciding that. This ask is about being able to read that decision
live and by name, the same pattern as `D_ProductCatalog`.

## Two ways to build this — whichever is less work on your side

**Option A — a small callable Decision Table (preferred if easy).**
A rule (Data Page or thin endpoint, `POST`-callable like
`D_ProductCatalog` was) that takes a few inputs matching what the
Screening/Document agents already produce and returns a decision:

Input (illustrative — adjust field names to whatever's natural on your side):
```json
{ "AddressMatchStatus": "MISMATCH", "ScreeningFlags": ["PEP_HIT"], "DuplicateCustomer": false }
```

Output:
```json
{ "ReviewRequired": true, "Reason": "Address mismatch requires manual confirmation", "Rule": "<the actual Decision Table/rule name>" }
```

Two example input combinations would cover the demo:
1. Clean — no mismatch, no flags, not a duplicate → `ReviewRequired: false`.
2. The existing `ADDRESS_PEP_REVIEW` scenario shape — address mismatch present → `ReviewRequired: true`, with a reason.

**Option B — just tell us the rule's name (zero build work).**
If exposing a new callable endpoint isn't worth it right now: what's the
actual Decision Table/rule that decides PRIM4/"pending review" routing for
this case type today, and is there a case-level field that states *why* a
given case landed there? If so, we'll build the demo around a real,
already-existing case instead of a hypothetical live call — same honesty
bar, just reading an outcome that already happened instead of asking a new
question.

## What we need back from you

- Which option, A or B.
- For A: the request/response shape actually returned (same as the
  product-catalog handoff — we'd rather match your real field names than
  guess).
- For B: the rule name, and which case field (if any) carries the reason.

## What changes on the app side once this exists

A second question gets added to the governance demo alongside the document
and interest-rate ones, following the identical pattern: raw model
improvises a judgment call, Pega's actual rule (read live, no fallback)
gives the deterministic answer with its reasoning.
