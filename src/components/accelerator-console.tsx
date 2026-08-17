"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  OrchestrationSwitch,
  type OrchestrationChoice,
} from "@/components/orchestration-switch";
import type { IndustryPack } from "@/lib/industry/types";
import type { OrchestrationMode } from "@/lib/onboarding/types";

/**
 * The launcher: which industry, and which system runs it.
 *
 * Both choices belong here rather than inside a journey. A customer opening a
 * bank account never picks an orchestration engine, and putting the control on
 * the bank's own site is what made the demo look like a product feature rather
 * than a configuration decision.
 *
 * The selection travels to the journey in the link, so it binds to the case
 * that gets created. Storing it as shared server state would mean one
 * presenter's choice changed what another visitor's application was running
 * on, mid-journey.
 */
export function AcceleratorConsole({ packs }: { packs: IndustryPack[] }) {
  const [choices, setChoices] = useState<OrchestrationChoice[]>([]);
  const [mode, setMode] = useState<OrchestrationMode | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadChoices() {
      try {
        const response = await fetch("/api/orchestration/options");

        if (!response.ok) {
          return;
        }

        const payload = await response.json();

        if (cancelled) {
          return;
        }

        setChoices(payload.options);

        // Never preselect something this environment cannot run: the journey
        // would fail only after the presenter had committed to starting it.
        const available = payload.options.filter(
          (option: OrchestrationChoice) => !option.unavailableReason,
        );

        setMode(
          (
            available.find(
              (option: OrchestrationChoice) => option.id === "pega",
            ) ??
            available.find(
              (option: OrchestrationChoice) => option.id === payload.activeMode,
            ) ??
            available[0]
          )?.id ?? null,
        );
      } catch {
        // The launcher still works without the switch; the journey then runs
        // on the configured default.
      }
    }

    loadChoices();

    return () => {
      cancelled = true;
    };
  }, []);

  const journeyHref = (industryId: string) =>
    mode ? `/${industryId}?mode=${mode}` : `/${industryId}`;

  return (
    <div className="space-y-8">
      {choices.length > 0 && mode ? (
        <div className="rounded-[28px] border border-[var(--color-border)] bg-white p-6">
          <OrchestrationSwitch
            choices={choices}
            value={mode}
            onChange={setMode}
          />
          <p className="mt-4 text-xs leading-5 text-[var(--color-ink-subtle)]">
            The journey you start below runs on the system selected here, and
            stays on it for the life of the case.
          </p>
        </div>
      ) : null}

      <ul className="grid gap-5 lg:grid-cols-3">
        {packs.map((pack) => (
          <li key={pack.id}>
            <Link
              href={journeyHref(pack.id)}
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
