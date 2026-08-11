import { getIndustryPack } from "@/lib/industry/registry";
import type { IndustryId } from "@/lib/industry/types";

/**
 * Footer for whichever organisation the customer is dealing with.
 *
 * Shares the journey with the header, and for the same reason: an insurance
 * application that closes with the bank's product list is not one platform
 * adapting, it is one platform leaking.
 */
export function BankFooter({
  industryId = "banking",
}: {
  industryId?: IndustryId;
}) {
  const pack = getIndustryPack(industryId);

  return (
    <footer className="border-t border-[var(--color-border)] bg-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-10 text-sm text-[var(--color-ink-subtle)] lg:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div className="space-y-3">
          <p className="text-lg font-semibold text-[var(--color-ink)]">
            {pack.brand.organisationName}
          </p>
          <p className="max-w-md leading-6">{pack.objective}</p>
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-[var(--color-ink)]">
            {pack.terminology.productNoun.replace(/^./, (c) => c.toUpperCase())}
          </p>
          <p>{pack.brand.productName}</p>
          {/* The systems this industry would integrate with, so each footer
              reads as that organisation's rather than a generic one. */}
          {pack.systems.slice(0, 2).map((system) => (
            <p key={system}>{system}</p>
          ))}
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-[var(--color-ink)]">Support</p>
          <p>Digital onboarding</p>
          <p>Application tracking</p>
          <p>Secure document upload</p>
        </div>
      </div>
    </footer>
  );
}
