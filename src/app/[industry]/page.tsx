import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, SectionTitle } from "@/components/ui";
import { getIndustryPack, isIndustryId } from "@/lib/industry/registry";

/** Each industry surface carries its own organisation's branding. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ industry: string }>;
}): Promise<Metadata> {
  const { industry } = await params;

  if (!isIndustryId(industry)) {
    return { title: "Not found" };
  }

  const pack = getIndustryPack(industry);

  return {
    title: `${pack.brand.organisationName} | ${pack.brand.productName}`,
    description: pack.objective,
  };
}

/**
 * Industry-flavoured entry experience.
 *
 * Everything on this page comes from the configuration pack. The journey
 * behind it — case lifecycle, policy, approvals, audit — is the same for every
 * industry, which is the point being demonstrated.
 */
export default async function IndustryHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ industry: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { industry } = await params;
  // Carried from the accelerator so the journey opens on the system the
  // presenter selected, without that choice becoming shared server state.
  const { mode } = await searchParams;

  // Unknown segments must 404 rather than silently rendering the reference
  // industry, otherwise every mistyped URL looks like a working page.
  if (!isIndustryId(industry)) {
    notFound();
  }

  const pack = getIndustryPack(industry);

  return (
    <div className="min-h-screen bg-[var(--color-surface-soft)]">
      <header
        className="border-b border-[var(--color-border)] bg-white"
        style={{ borderTopWidth: 4, borderTopColor: pack.brand.accent }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 lg:px-8">
          <div>
            <p className="text-lg font-semibold text-[var(--color-ink)]">
              {pack.brand.organisationName}
            </p>
            <p className="text-sm text-[var(--color-ink-subtle)]">
              {pack.brand.tagline}
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

      <main className="mx-auto max-w-6xl px-6 py-14 lg:px-8">
        <Card className="space-y-8">
          <SectionTitle
            eyebrow={pack.displayName}
            title={pack.brand.productName}
            description={pack.objective}
          />

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-5 rounded-[28px] bg-[var(--color-surface-soft)] p-6">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                What you will need
              </p>
              <ul className="space-y-3 text-sm leading-6 text-[var(--color-ink-subtle)]">
                {pack.requiredDocuments.map((document) => (
                  <li key={document.kind}>
                    <span className="font-medium text-[var(--color-ink)]">
                      {document.label}
                    </span>{" "}
                    — {document.description}
                  </li>
                ))}
              </ul>

              <Link
                href={`/onboarding/start?industry=${pack.id}${
                  mode ? `&mode=${encodeURIComponent(mode)}` : ""
                }`}
                className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: pack.brand.accent }}
              >
                Begin application
              </Link>
            </div>

            <div className="space-y-5 rounded-[28px] border border-[var(--color-border)] bg-white p-6">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Connected systems
              </p>
              <ul className="space-y-2 text-sm leading-6 text-[var(--color-ink-subtle)]">
                {pack.systems.map((system) => (
                  <li key={system}>{system}</li>
                ))}
              </ul>

              {pack.completeness === "adaptability-demonstration" ? (
                <p className="rounded-2xl bg-[var(--color-surface-soft)] px-4 py-3 text-xs leading-5 text-[var(--color-ink-subtle)]">
                  This industry demonstrates configuration-driven adaptability.
                  The branding, terminology, collected details and required
                  evidence come from its pack; the onboarding flow behind it is
                  the same one the reference implementation uses.
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
