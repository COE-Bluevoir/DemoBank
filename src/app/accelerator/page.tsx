import Link from "next/link";

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

          <ul className="grid gap-5 lg:grid-cols-3">
            {packs.map((pack) => (
              <li key={pack.id}>
                <Link
                  href={`/${pack.id}`}
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
                        {pack.requiredDocuments.length} documents
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Details collected</dt>
                      <dd className="text-right text-[var(--color-ink)]">
                        {pack.intakeFields.length} fields
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
