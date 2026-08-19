import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  FileCheck,
  Home as HomeIcon,
  Landmark,
  PhoneCall,
  Router,
  ShieldCheck,
  Signal,
  Wifi,
} from "lucide-react";

import { AssistantChat } from "@/components/assistant-chat";
import { BankFooter } from "@/components/bank-footer";
import { BankHeader } from "@/components/bank-header";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui";
import { getIndustryPack } from "@/lib/industry/registry";
import type { IndustryId } from "@/lib/industry/types";
import type { HomeIconKey } from "@/lib/industry/home-content";
import { INDUSTRY_HOME_CONTENT } from "@/lib/industry/home-content";

const ICONS: Record<HomeIconKey, typeof Building2> = {
  Building2,
  ShieldCheck,
  Landmark,
  PhoneCall,
  ClipboardCheck,
  FileCheck,
  Home: HomeIcon,
  Wifi,
  Router,
  Signal,
};

/**
 * The front door for an industry other than banking.
 *
 * Same structure as banking's bespoke homepage (hero, quick actions, sign-in,
 * products, trust, footer) so the accelerator's other two industries read as
 * real organisations rather than a bare configuration page — this is a
 * visual front door, not a claim that the journey behind it has had the same
 * live-reliability work banking has. See each pack's `completeness` field.
 */
export function IndustryHomepage({ industryId }: { industryId: IndustryId }) {
  const pack = getIndustryPack(industryId);
  const content = INDUSTRY_HOME_CONTENT[industryId];

  if (!content) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <div className="bg-[var(--color-navy)] py-2 text-center text-xs text-white/70">
        Demonstration environment — a fictional organisation. No real
        accounts, money or customer data.
      </div>

      <BankHeader industryId={industryId} />

      <main>
        <section
          className="relative overflow-hidden text-white"
          style={{ backgroundColor: "var(--color-navy)" }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at top right, ${pack.brand.accent}55, transparent 38%), radial-gradient(circle at 15% 25%, rgba(255,255,255,0.07), transparent 26%)`,
            }}
          />

          <div className="relative mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
            <div className="space-y-7">
              <p
                className="text-sm font-semibold uppercase tracking-[0.24em]"
                style={{ color: pack.brand.accent }}
              >
                {pack.brand.tagline}
              </p>
              <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
                {content.heroHeadline}
              </h1>
              <p className="max-w-xl text-lg leading-8 text-white/75">
                {content.heroSubhead}
              </p>

              <div className="flex flex-wrap gap-3">
                <Link href="/onboarding/start">
                  <Button>Begin application</Button>
                </Link>
                <a href="#products">
                  <Button
                    variant="secondary"
                    className="border-white/15 bg-white/10 text-white hover:bg-white/15"
                  >
                    Compare products
                  </Button>
                </a>
              </div>

              <dl className="grid max-w-xl gap-6 border-t border-white/12 pt-6 sm:grid-cols-3">
                {content.heroStats.map((stat) => (
                  <div key={stat.label}>
                    <dt className="text-2xl font-semibold">{stat.value}</dt>
                    <dd className="text-sm text-white/65">{stat.label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-[28px] border border-white/12 bg-white p-6 text-[var(--color-ink)] shadow-[0_24px_60px_rgba(6,20,35,0.28)]">
              <p className="text-lg font-semibold">{content.signIn.title}</p>
              <p className="mt-1 text-sm text-[var(--color-ink-subtle)]">
                {content.signIn.subtitle}
              </p>

              <div className="mt-5 space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-[var(--color-ink-subtle)]">
                    {content.signIn.idLabel}
                  </span>
                  <input
                    type="text"
                    disabled
                    placeholder="Not available in this demonstration"
                    className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2.5 text-sm"
                  />
                </label>

                <button
                  type="button"
                  disabled
                  className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white opacity-60"
                  style={{ backgroundColor: "var(--color-navy)" }}
                >
                  Continue
                </button>
              </div>

              <Link
                href="/onboarding/start"
                className="mt-5 flex items-center justify-between rounded-2xl bg-[var(--color-surface-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[#EEF3F9]"
              >
                {content.signIn.newCustomerLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>

              <div className="mt-4 flex items-center gap-2 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-ink-subtle)]">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--color-teal)]" />
                <span>{content.signIn.disclaimer}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-[var(--color-border)] bg-white">
          <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {content.quickActions.map((action) => {
                const Icon = ICONS[action.icon];
                return (
                  <Link
                    key={action.label}
                    href={action.href}
                    className="group flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 transition hover:border-[var(--color-border)] hover:bg-[var(--color-surface-soft)]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-soft)] text-[var(--color-teal)] group-hover:bg-white">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[var(--color-ink)]">
                        {action.label}
                      </span>
                      <span className="block truncate text-xs text-[var(--color-ink-subtle)]">
                        {action.detail}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section id="products" className="bg-[var(--color-surface-soft)]">
          <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
              {content.productsHeading}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-ink-subtle)]">
              {content.productsSubhead}
            </p>
            <div className="mt-6">
              <ProductCard
                industryId={industryId}
                ctaLabel="Begin application"
              />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
            {pack.brand.organisationName}
          </h2>

          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            {content.trustPoints.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <div
                  key={item.title}
                  className="rounded-[26px] border border-[var(--color-border)] bg-white p-6"
                >
                  <Icon className="h-6 w-6 text-[var(--color-teal)]" />
                  <h3 className="mt-4 text-lg font-semibold text-[var(--color-ink)]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-[var(--color-ink-subtle)]">
                    {item.text}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section
          id="support"
          className="border-t border-[var(--color-border)] bg-white"
        >
          <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8">
            <div className="flex items-start gap-4">
              <Building2 className="mt-1 h-6 w-6 shrink-0 text-[var(--color-teal)]" />
              <div>
                <p className="text-lg font-semibold text-[var(--color-ink)]">
                  {content.ctaHeading}
                </p>
                <p className="mt-1 text-sm leading-7 text-[var(--color-ink-subtle)]">
                  {content.ctaText}
                </p>
              </div>
            </div>
            <Link href="/onboarding/start">
              <Button>{content.ctaButtonLabel}</Button>
            </Link>
          </div>
        </section>
      </main>

      <BankFooter industryId={industryId} />

      <AssistantChat industryId={industryId} />
    </div>
  );
}
