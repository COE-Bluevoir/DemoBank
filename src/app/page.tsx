import Link from "next/link";
import { Building2, Landmark, PhoneCall, ShieldCheck } from "lucide-react";

import { AssistantChat } from "@/components/assistant-chat";
import { BankFooter } from "@/components/bank-footer";
import { BankHeader } from "@/components/bank-header";
import { QuickActions, SignInPanel } from "@/components/home/quick-actions";
import { RateBoard } from "@/components/home/rate-board";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui";
import { BRAND } from "@/lib/onboarding/constants";

/**
 * NorthStar Bank's front door.
 *
 * Built to read as a bank a customer already uses rather than a landing page
 * for one product: sign in, today's rates, the errands people come to do, and
 * the reassurances a regulated institution is expected to show.
 *
 * Everything is fictional and marked as a demonstration. The onboarding
 * journey is one path off this page, not the whole of it.
 */
export default function HomePage() {
  return (
    <div className="min-h-screen">
      <div className="bg-[var(--color-navy)] py-2 text-center text-xs text-white/70">
        Demonstration environment — a fictional bank. No real accounts, money or
        customer data.
      </div>

      <BankHeader />

      <main>
        <section className="relative overflow-hidden bg-[var(--color-navy)] text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,140,149,0.34),transparent_38%),radial-gradient(circle_at_15%_25%,rgba(255,255,255,0.07),transparent_26%)]" />

          <div className="relative mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
            <div className="space-y-7">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#8BDCE1]">
                {BRAND.tagline}
              </p>
              <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
                Banking that fits the way you actually manage money.
              </h1>
              <p className="max-w-xl text-lg leading-8 text-white/75">
                Current accounts, savings, cards and business banking — opened
                online in minutes, with your application tracked at every step.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link href="/onboarding/start">
                  <Button>Open an account</Button>
                </Link>
                <Link href="/accounts/everyday-plus">
                  <Button
                    variant="secondary"
                    className="border-white/15 bg-white/10 text-white hover:bg-white/15"
                  >
                    Compare accounts
                  </Button>
                </Link>
              </div>

              <dl className="grid max-w-xl gap-6 border-t border-white/12 pt-6 sm:grid-cols-3">
                {[
                  { value: "2.4M", label: "customers" },
                  { value: "480", label: "branches" },
                  { value: "24/7", label: "support" },
                ].map((stat) => (
                  <div key={stat.label}>
                    <dt className="text-2xl font-semibold">{stat.value}</dt>
                    <dd className="text-sm text-white/65">{stat.label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <SignInPanel />
          </div>
        </section>

        <QuickActions />
        <RateBoard />

        <section className="bg-[var(--color-surface-soft)]">
          <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
            <ProductCard />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
            Banking with NorthStar
          </h2>

          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                title: "Your money is protected",
                text: "Eligible deposits are covered up to ₹5,00,000 per depositor under the deposit insurance scheme.",
              },
              {
                icon: Landmark,
                title: "Regulated and supervised",
                text: "Licensed as a scheduled commercial bank and supervised in line with prevailing banking regulations.",
              },
              {
                icon: PhoneCall,
                title: "Support when you need it",
                text: "Speak to a person 24 hours a day, or track your application online without calling at all.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-[26px] border border-[var(--color-border)] bg-white p-6"
              >
                <item.icon className="h-6 w-6 text-[var(--color-teal)]" />
                <h3 className="mt-4 text-lg font-semibold text-[var(--color-ink)]">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-7 text-[var(--color-ink-subtle)]">
                  {item.text}
                </p>
              </div>
            ))}
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
                  Opening an account for your business?
                </p>
                <p className="mt-1 text-sm leading-7 text-[var(--color-ink-subtle)]">
                  Business current accounts are opened online with your
                  incorporation and tax documents. Most applications are
                  completed in one sitting.
                </p>
              </div>
            </div>
            <Link href="/onboarding/start">
              <Button>Start a business application</Button>
            </Link>
          </div>
        </section>
      </main>

      <BankFooter />

      {/* Answers questions alongside the site. It cannot act on an
          application — every change still goes through the journey. */}
      <AssistantChat industryId="banking" />
    </div>
  );
}
