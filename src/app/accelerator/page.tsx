import Link from "next/link";

import { AcceleratorConsole } from "@/components/accelerator-console";
import { Card, SectionTitle } from "@/components/ui";
import { listIndustryPacks } from "@/lib/industry/registry";

/**
 * Bluevoir accelerator launcher.
 *
 * Deliberately sits outside the industry experiences. A customer never chooses
 * an industry from inside a bank's website; that selection belongs to whoever
 * is configuring the accelerator.
 */
export default function AcceleratorPage() {
  const packs = listIndustryPacks();

  return (
    <div className="min-h-screen bg-[var(--color-surface-soft)]">
      <main className="mx-auto max-w-6xl px-6 py-16 lg:px-8">
        <Card className="space-y-10">
          <SectionTitle
            eyebrow="Bluevoir accelerator"
            title="Client onboarding and service activation"
            description="One governed onboarding platform. Each industry supplies its own branding, terminology, intake details and required evidence, while the case lifecycle, policy, approvals and audit stay common."
          />

          <AcceleratorConsole packs={packs} />

          <Link
            href="/accelerator/behind-the-scenes"
            className="flex items-center justify-between rounded-[28px] border border-[var(--color-border)] bg-white p-6 transition hover:border-[var(--color-ink)]"
          >
            <span>
              <span className="block text-sm font-semibold text-[var(--color-ink)]">
                Behind the scenes
              </span>
              <span className="mt-1 block text-sm text-[var(--color-ink-subtle)]">
                How a case actually moves between this app and Pega — case
                orchestration, Pega&apos;s own agents, and the inbound
                MCP/A2A integrations, step by step.
              </span>
            </span>
            <span aria-hidden className="text-[var(--color-ink-subtle)]">
              →
            </span>
          </Link>

          <Link
            href="/accelerator/governance"
            className="flex items-center justify-between rounded-[28px] border border-[var(--color-border)] bg-white p-6 transition hover:border-[var(--color-ink)]"
          >
            <span>
              <span className="block text-sm font-semibold text-[var(--color-ink)]">
                AI governance console
              </span>
              <span className="mt-1 block text-sm text-[var(--color-ink-subtle)]">
                How each AI decision was produced and grounded, and what
                governed execution adds over answering alone.
              </span>
            </span>
            <span aria-hidden className="text-[var(--color-ink-subtle)]">
              →
            </span>
          </Link>

          <div className="rounded-[28px] bg-[var(--color-surface-soft)] p-6">
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              What stays the same across industries
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-ink-subtle)]">
              Intake, document handling, case creation and lifecycle, workflow
              and SLA management, exception handling, human approval, customer
              communications, service activation and the audit trail are common
              platform capabilities. Only the configuration pack changes.
            </p>
          </div>
        </Card>
      </main>
    </div>
  );
}
