import Link from "next/link";

/**
 * The rates and fees a bank leads with.
 *
 * Real banking sites open with numbers, because that is what a customer came
 * to compare. A page of adjectives reads as a brochure, and the demo is meant
 * to look like a bank a person could actually be using.
 *
 * Everything here is illustrative for a fictional bank and is labelled as
 * such — a rate table that looked like a real offer would be a different kind
 * of problem.
 */

const RATES = [
  {
    product: "Everyday Plus Account",
    headline: "₹0",
    unit: "monthly fee",
    detail: "No minimum balance for salaried customers",
    href: "/accounts/everyday-plus",
  },
  {
    product: "Savings Plus",
    headline: "3.75%",
    unit: "p.a. on balances over ₹1,00,000",
    detail: "Interest credited quarterly",
    href: "/accounts/everyday-plus",
  },
  {
    product: "Fixed Deposit",
    headline: "7.10%",
    unit: "p.a. for 18 months",
    detail: "Senior citizens earn an additional 0.50%",
    href: "/accounts/everyday-plus",
  },
  {
    product: "Business Current Account",
    headline: "₹0",
    unit: "on first 100 transactions",
    detail: "Built for growing businesses",
    href: "/onboarding/start",
  },
];

export function RateBoard() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
            Today&apos;s rates
          </h2>
          <p className="mt-1 text-sm text-[var(--color-ink-subtle)]">
            Effective 12 August 2026. Illustrative rates for this demonstration
            bank.
          </p>
        </div>
        <Link
          href="/accounts/everyday-plus"
          className="text-sm font-semibold text-[var(--color-teal)] hover:underline"
        >
          Compare all accounts →
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {RATES.map((rate) => (
          <Link
            key={rate.product}
            href={rate.href}
            className="group rounded-[22px] border border-[var(--color-border)] bg-white p-5 transition hover:border-[var(--color-teal)] hover:shadow-[0_12px_32px_rgba(16,42,67,0.08)]"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
              {rate.product}
            </p>
            <p className="mt-3 text-3xl font-semibold text-[var(--color-ink)]">
              {rate.headline}
            </p>
            <p className="mt-1 text-xs text-[var(--color-ink-subtle)]">
              {rate.unit}
            </p>
            <p className="mt-3 border-t border-[var(--color-border)] pt-3 text-xs leading-5 text-[var(--color-ink-subtle)]">
              {rate.detail}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
