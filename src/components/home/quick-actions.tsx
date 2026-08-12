import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CreditCard,
  PiggyBank,
  Receipt,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

/**
 * The things people actually come to a bank's site to do.
 *
 * A real homepage is mostly a set of errands — pay something, find a branch,
 * open an account, report a lost card. Leading with a single call to action
 * is what made this look like a landing page for one product rather than a
 * bank a customer already uses.
 */

const ACTIONS = [
  {
    icon: Building2,
    label: "Open an account",
    detail: "Personal or business",
    href: "/onboarding/start",
  },
  {
    icon: PiggyBank,
    label: "Savings & deposits",
    detail: "Compare rates",
    href: "/accounts/everyday-plus",
  },
  {
    icon: CreditCard,
    label: "Cards",
    detail: "Debit and credit",
    href: "/accounts/everyday-plus",
  },
  {
    icon: Receipt,
    label: "Payments",
    detail: "Transfers and bills",
    href: "/accounts/everyday-plus",
  },
  {
    icon: Smartphone,
    label: "Mobile banking",
    detail: "iOS and Android",
    href: "/accounts/everyday-plus",
  },
  {
    icon: ShieldCheck,
    label: "Report fraud",
    detail: "24/7 helpline",
    href: "#support",
  },
] as const;

export function QuickActions() {
  return (
    <section className="border-b border-[var(--color-border)] bg-white">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ACTIONS.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="group flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 transition hover:border-[var(--color-border)] hover:bg-[var(--color-surface-soft)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-soft)] text-[var(--color-teal)] group-hover:bg-white">
                <action.icon className="h-5 w-5" />
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
          ))}
        </div>
      </div>
    </section>
  );
}

/** Sign-in panel. A bank's homepage is a front door before it is a brochure. */
export function SignInPanel() {
  return (
    <div className="rounded-[28px] border border-white/12 bg-white p-6 text-[var(--color-ink)] shadow-[0_24px_60px_rgba(6,20,35,0.28)]">
      <p className="text-lg font-semibold">Log in to online banking</p>
      <p className="mt-1 text-sm text-[var(--color-ink-subtle)]">
        Access your accounts, payments and statements.
      </p>

      <div className="mt-5 space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-[var(--color-ink-subtle)]">
            Customer ID
          </span>
          <input
            type="text"
            // A demonstration site: the field is present because a bank has
            // one, and deliberately does not authenticate anything.
            disabled
            placeholder="Not available in this demonstration"
            className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2.5 text-sm"
          />
        </label>

        <button
          type="button"
          disabled
          className="w-full rounded-xl bg-[var(--color-navy)] px-4 py-2.5 text-sm font-semibold text-white opacity-60"
        >
          Continue
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--color-ink-subtle)]">
        <span>Forgotten your customer ID?</span>
        <span>Register for online banking</span>
      </div>

      <Link
        href="/onboarding/start"
        className="mt-5 flex items-center justify-between rounded-2xl bg-[var(--color-surface-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-ink)] transition hover:bg-[#EEF3F9]"
      >
        New to NorthStar? Open an account
        <ArrowRight className="h-4 w-4" />
      </Link>

      <div className="mt-4 flex items-center gap-2 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-ink-subtle)]">
        <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--color-teal)]" />
        <span>
          Never share your login details. NorthStar will never ask for them by
          phone or email.
        </span>
      </div>
    </div>
  );
}
