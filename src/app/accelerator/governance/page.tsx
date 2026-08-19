import type { Metadata } from "next";
import Link from "next/link";

import { DeterministicDecisionDemo } from "@/components/deterministic-decision-demo";
import { GovernanceConsole } from "@/components/governance-console";
import { HallucinationDemo } from "@/components/hallucination-demo";
import { WorkflowGovernanceDemo } from "@/components/workflow-governance-demo";

export const metadata: Metadata = {
  title: "AI governance console",
  description:
    "How each AI decision was produced, grounded and validated, and what governed execution adds.",
};

export default function GovernancePage() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-soft)]">
      <header className="border-b border-[var(--color-border)] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 lg:px-8">
          <div>
            <p className="text-lg font-semibold text-[var(--color-ink)]">
              AI governance console
            </p>
            <p className="text-sm text-[var(--color-ink-subtle)]">
              Behind the scenes: how decisions are made, inside and outside the
              workflow
            </p>
          </div>
          <Link
            href="/accelerator"
            className="text-sm text-[var(--color-ink-subtle)] underline-offset-4 hover:underline"
          >
            Accelerator
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10 lg:px-8">
        <div className="grid gap-3 rounded-[24px] border border-[var(--color-border)] bg-white p-6 sm:grid-cols-3">
          {[
            { n: "1", q: "Does it know the truth?" },
            { n: "2", q: "Can it corrupt the system if it's wrong?" },
            { n: "3", q: "Does it get to make the important calls?" },
          ].map((item) => (
            <div key={item.n} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-soft)] text-xs font-semibold text-[var(--color-ink-subtle)]">
                {item.n}
              </span>
              <p className="text-sm font-medium text-[var(--color-ink)]">
                {item.q}
              </p>
            </div>
          ))}
        </div>

        <HallucinationDemo />
        <WorkflowGovernanceDemo />
        <DeterministicDecisionDemo />
        <GovernanceConsole />
      </main>
    </div>
  );
}
