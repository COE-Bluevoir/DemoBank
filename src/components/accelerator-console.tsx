"use client";

import Link from "next/link";

import type { IndustryPack } from "@/lib/industry/types";

/**
 * The launcher: which industry to open the journey for.
 *
 * Orchestration mode used to be a presenter-facing choice here too, but it
 * is fixed per deployment now (see /api/demo/mode) — its runtime toggle
 * lived in a per-server-instance store that Amplify's parallel instances
 * don't share, which could leave a case running on the mock engine while
 * every diagnostic correctly reported live Pega as configured. Removing the
 * toggle removes the failure mode.
 */
export function AcceleratorConsole({ packs }: { packs: IndustryPack[] }) {
  return (
    <div className="space-y-8">
      <ul className="grid gap-5 lg:grid-cols-3">
        {packs.map((pack) => (
          <li key={pack.id}>
            <Link
              href={pack.id === "banking" ? "/" : `/${pack.id}`}
              className="flex h-full flex-col gap-4 rounded-[28px] border border-[var(--color-border)] bg-white p-6 transition hover:border-[var(--color-ink)]"
            >
              <span
                aria-hidden
                className="h-1.5 w-12 rounded-full"
                style={{ backgroundColor: pack.brand.accent }}
              />
              <div className="space-y-1">
                <p className="text-lg font-semibold text-[var(--color-ink)]">
                  {pack.displayName}
                </p>
                <p className="text-sm text-[var(--color-ink-subtle)]">
                  {pack.brand.organisationName}
                </p>
              </div>

              <p className="text-sm leading-6 text-[var(--color-ink-subtle)]">
                {pack.objective}
              </p>

              <dl className="mt-auto space-y-2 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-ink-subtle)]">
                <div className="flex justify-between gap-3">
                  <dt>Evidence required</dt>
                  <dd className="text-right text-[var(--color-ink)]">
                    {pack.documentProfile.length} documents
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Journey</dt>
                  <dd className="text-right text-[var(--color-ink)]">
                    {pack.journeyCode.replace(/_/g, " ").toLowerCase()}
                  </dd>
                </div>
              </dl>

              <p className="text-xs font-medium text-[var(--color-ink)]">
                {pack.completeness === "reference-implementation"
                  ? "Reference implementation — complete journey"
                  : "Adaptability demonstration — configuration only"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
