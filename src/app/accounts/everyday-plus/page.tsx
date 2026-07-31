import Link from "next/link";

import { BankFooter } from "@/components/bank-footer";
import { BankHeader } from "@/components/bank-header";
import { Button, Card, SectionTitle } from "@/components/ui";
import { BRAND } from "@/lib/onboarding/constants";

export default function EverydayPlusPage() {
  return (
    <div className="min-h-screen">
      <BankHeader />
      <main className="mx-auto max-w-7xl space-y-8 px-6 py-16 lg:px-8">
        <Card className="space-y-6">
          <SectionTitle
            eyebrow="Everyday banking"
            title={BRAND.productName}
            description="A digital-first current account experience designed for salary deposits, secure payments and everyday money movement."
          />
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-5 text-sm leading-7 text-[var(--color-ink-subtle)]">
              <p>
                The Everyday Plus Account is designed for customers who want a
                straightforward onboarding experience, a strong digital
                servicing foundation and clear visibility into their
                application.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[24px] bg-[var(--color-surface-soft)] p-5">
                  <p className="font-semibold text-[var(--color-ink)]">
                    Key benefits
                  </p>
                  <ul className="mt-3 space-y-2">
                    <li>Salary credits and everyday payments</li>
                    <li>Guided digital account opening</li>
                    <li>Clear progress and status updates</li>
                  </ul>
                </div>
                <div className="rounded-[24px] bg-[var(--color-surface-soft)] p-5">
                  <p className="font-semibold text-[var(--color-ink)]">
                    Eligibility
                  </p>
                  <ul className="mt-3 space-y-2">
                    <li>Individual retail banking applicant</li>
                    <li>Identity and proof-of-address upload</li>
                    <li>Consent acknowledgement</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-6">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Required documents
              </p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--color-ink-subtle)]">
                <li>Government-issued identity document</li>
                <li>Proof of residential address</li>
                <li>Accepted formats: PDF, JPG and PNG</li>
              </ul>
              <p className="mt-6 rounded-2xl bg-white px-4 py-3 text-sm text-[var(--color-warning)]">
                Product features shown here are for experience preview purposes
                and may be subject to review during formal onboarding.
              </p>
              <div className="mt-6">
                <Link href="/onboarding/start">
                  <Button>Open this account</Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>
      </main>
      <BankFooter />
    </div>
  );
}
