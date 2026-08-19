import { CheckCircle2, Gavel, ShieldCheck } from "lucide-react";

import { Badge, Card, SectionTitle } from "@/components/ui";

/**
 * "Does it get to make the important calls?" — no, a named rule does.
 *
 * Not a live call, on purpose: `ClearToCreateAuthorization` (the rule
 * genuinely confirmed wired into this case type's flow) has two of its
 * input fields silently blanked before save by a real, confirmed platform
 * bug — two auto-generated Rule-Declare-Expressions with a hardcoded empty
 * expression, filed as Pega ChangeRequest PEGAACCEL PXC-149, fix pending.
 * Faking a live read here would repeat the exact mistake this page's other
 * two demos were already corrected for. Everything below is either a real,
 * captured fact (the rule name, the case, the check results) or clearly
 * marked illustrative — nothing is presented as a live verified read.
 */
export function DeterministicDecisionDemo() {
  return (
    <Card className="space-y-5">
      <SectionTitle
        eyebrow="Does it get to make the important calls?"
        title="A named rule decides — not an AI's judgment call"
        description="Whether an application needs human review isn't left to a model's opinion. A named Pega rule decides, from the same inputs, the same way, every time — and that decision is traceable to a specific rule, not a guess."
      />

      <div className="space-y-3 rounded-[20px] border border-[var(--color-border)] bg-white p-5">
        <div className="flex items-center gap-2">
          <Gavel className="h-4 w-4 text-[var(--color-navy)]" />
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            The rule, confirmed wired into this case type
          </p>
        </div>
        <p className="text-sm leading-6 text-[var(--color-ink-subtle)]">
          <code className="text-[var(--color-ink)]">ClearToCreateAuthorization</code>{" "}
          — reads <code>.TechnicalStatus</code>, <code>.ReasonCode</code> and{" "}
          <code>.pyStatusWork</code> off the case and returns the routing
          decision. Confirmed by tracing the actual flow, not inferred from a
          rule name.
        </p>
      </div>

      <div className="space-y-3 rounded-[20px] border border-[var(--color-success)]/30 bg-[#EDF9F4] p-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            A real, captured run
          </p>
          <Badge tone="success">Case ODHMNT-AGENTICC-WORK C-209050</Badge>
        </div>
        <p className="text-sm leading-6 text-[var(--color-ink-subtle)]">
          Driven live through Perform Screening. All four checks came back
          deterministic, same-shape results, and the case resolved to
          Complete on them — not on any model&apos;s opinion:
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            "SanctionsCheck — Passed",
            "PEPCheck — Passed",
            "DuplicateCustomerCheck — Passed",
            "DocumentFraudCheck — Passed",
          ].map((row) => (
            <p
              key={row}
              className="rounded-lg bg-white px-3 py-2 text-xs text-[var(--color-ink)]"
            >
              {row}
            </p>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-[var(--color-warning)]/40 bg-[#FBF1E0] px-4 py-3 text-xs leading-5 text-[var(--color-ink-subtle)]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" />
        <span>
          <span className="font-semibold text-[var(--color-ink)]">
            What&apos;s not shown live yet:{" "}
          </span>
          Two of this rule&apos;s input fields aren&apos;t persisting today —
          a confirmed platform bug (two auto-generated rules silently blank
          them before save), already filed as Pega ChangeRequest{" "}
          <code>PEGAACCEL PXC-149</code>, fix pending. Once resolved, this
          panel reads the rule&apos;s actual output live, the same way the
          two demos above do.
        </span>
      </div>
    </Card>
  );
}
