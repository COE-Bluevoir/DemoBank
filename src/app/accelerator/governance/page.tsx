import type { Metadata } from "next";
import Link from "next/link";

import { GovernanceConsole } from "@/components/governance-console";

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

      <main className="mx-auto max-w-6xl px-6 py-10 lg:px-8">
        <GovernanceConsole />
      </main>
    </div>
  );
}
