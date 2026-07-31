import Link from "next/link";

import { BRAND } from "@/lib/onboarding/constants";
import { Button } from "@/components/ui";

export function BankHeader() {
  return (
    <header className="border-b border-white/10 bg-[var(--color-navy)] text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12 text-lg font-bold">
            N
          </div>
          <div>
            <p className="text-lg font-semibold">{BRAND.bankName}</p>
            <p className="text-xs text-white/70">{BRAND.tagline}</p>
          </div>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-white/80 md:flex">
          <Link href="/" className="hover:text-white">
            Accounts
          </Link>
          <a href="#cards" className="hover:text-white">
            Cards
          </a>
          <a href="#borrow" className="hover:text-white">
            Borrow
          </a>
          <a href="#support" className="hover:text-white">
            Support
          </a>
        </nav>
        <Button
          variant="secondary"
          className="border-white/15 bg-white/10 text-white hover:bg-white/15"
          type="button"
        >
          Sign in
        </Button>
      </div>
    </header>
  );
}
