import Link from "next/link";

import { getIndustryPack } from "@/lib/industry/registry";
import type { IndustryId } from "@/lib/industry/types";
import { Button } from "@/components/ui";

/**
 * Site chrome for whichever organisation the customer is dealing with.
 *
 * The journey pages are shared across industries, so the header has to be too.
 * Hardcoding the bank here is what put "NorthStar Bank" above an insurance
 * application — the one thing a configuration-driven accelerator must not do.
 */
export function BankHeader({
  industryId = "banking",
}: {
  industryId?: IndustryId;
}) {
  const pack = getIndustryPack(industryId);
  const home = industryId === "banking" ? "/" : `/${industryId}`;

  return (
    <header
      className="border-b border-white/10 bg-[var(--color-navy)] text-white"
      style={{ borderBottomWidth: 3, borderBottomColor: pack.brand.accent }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
        <Link href={home} className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-bold"
            style={{ backgroundColor: pack.brand.accent }}
          >
            {pack.brand.organisationName.charAt(0)}
          </div>
          <div>
            <p className="text-lg font-semibold">
              {pack.brand.organisationName}
            </p>
            <p className="text-xs text-white/70">{pack.brand.tagline}</p>
          </div>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-white/80 md:flex">
          <Link href={home} className="hover:text-white">
            {pack.brand.productName}
          </Link>
          <Link href="/accelerator" className="hover:text-white">
            Industries
          </Link>
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
