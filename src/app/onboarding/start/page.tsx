"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { BankHeader } from "@/components/bank-header";
import { Button, Card, SectionTitle } from "@/components/ui";
import { listProductOptions, resolveIndustryPack } from "@/lib/industry/registry";

function OnboardingStartExperience() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Which industry configuration the customer arrived from. Unknown or absent
  // values fall back to the reference implementation.
  const pack = resolveIndustryPack(searchParams.get("industry") ?? undefined);
  // Which product within that pack — the home page's product cards link
  // here with one selected. An unrecognised or absent code falls back to
  // the pack's first (reference) product, same fallback `resolveProductName`
  // uses server-side, so the page and the case it creates never disagree.
  const products = listProductOptions(pack);
  const requestedProduct = searchParams.get("product");
  const product =
    products.find((option) => option.code === requestedProduct) ?? products[0];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startJourney() {
    setBusy(true);
    setError(null);

    const createResponse = await fetch("/api/onboarding/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productCode: product.code,
        channel: "WEB",
        scenarioId: "ADDRESS_PEP_REVIEW",
        industryId: pack.id,
        // Orchestration mode is fixed for this deployment and the server
        // ignores any value sent here — nothing to bind.
      }),
    });

    const payload = await createResponse.json();

    if (!createResponse.ok) {
      setError(payload.message || "Unable to create the onboarding case.");
      setBusy(false);
      return;
    }

    const beginResponse = await fetch(
      `/api/onboarding/cases/${encodeURIComponent(payload.caseId)}/actions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: "BEGIN_APPLICATION",
          expectedCaseVersion: payload.caseVersion,
        }),
      },
    );

    if (!beginResponse.ok) {
      const beginPayload = await beginResponse.json();
      setError(beginPayload.message || "Unable to start the application flow.");
      setBusy(false);
      return;
    }

    setBusy(false);
    router.push(payload.nextUrl);
  }

  return (
    <div className="min-h-screen">
      <BankHeader />
      <main className="mx-auto max-w-5xl px-6 py-16 lg:px-8">
        <Card className="space-y-8">
          <SectionTitle
            eyebrow="Open an account"
            title={`Open your ${product.name}`}
            description="Start your application in a guided digital flow with clear requirements, secure document handling and progress updates throughout."
          />
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-5 rounded-[28px] bg-[var(--color-surface-soft)] p-6">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Need help getting started?
              </p>
              <div className="rounded-[24px] bg-white p-5 text-sm leading-7 text-[var(--color-ink)]">
                I&apos;m looking at the {product.name}.
              </div>
              <div className="rounded-[24px] bg-white p-5 text-sm leading-7 text-[var(--color-ink)]">
                {product.description} Would you like to review the account
                details or begin your application?
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="button" disabled={busy} onClick={startJourney}>
                  Begin application
                </Button>
                {product.code === "EVERYDAY_PLUS" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => router.push("/accounts/everyday-plus")}
                  >
                    Review account
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="space-y-5 rounded-[28px] border border-[var(--color-border)] bg-white p-6">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Before you begin
              </p>
              <ul className="space-y-3 text-sm leading-6 text-[var(--color-ink-subtle)]">
                <li>Keep your identity and proof-of-address documents ready.</li>
                <li>The application usually takes only a few guided steps to complete.</li>
                <li>You can review your progress during verification and follow-up.</li>
              </ul>
              {error ? (
                <p className="rounded-2xl bg-[#FEE4E2] px-4 py-3 text-sm text-[var(--color-error)]">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}

/**
 * The industry is read from the query string, which requires a Suspense
 * boundary so the shell can still be prerendered.
 */
export default function OnboardingStartPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingStartExperience />
    </Suspense>
  );
}
