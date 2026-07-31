"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BankHeader } from "@/components/bank-header";
import { Button, Card, SectionTitle } from "@/components/ui";
import { BRAND } from "@/lib/onboarding/constants";

export default function OnboardingStartPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startJourney() {
    setBusy(true);
    setError(null);

    const createResponse = await fetch("/api/onboarding/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productCode: "EVERYDAY_PLUS",
        channel: "WEB",
        scenarioId: "ADDRESS_PEP_REVIEW",
      }),
    });

    const payload = await createResponse.json();

    if (!createResponse.ok) {
      setError(payload.message || "Unable to create the onboarding case.");
      setBusy(false);
      return;
    }

    const beginResponse = await fetch(
      `/api/onboarding/cases/${payload.caseId}/actions`,
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
            title={`Open your ${BRAND.productName}`}
            description="Start your application in a guided digital flow with clear requirements, secure document handling and progress updates throughout."
          />
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-5 rounded-[28px] bg-[var(--color-surface-soft)] p-6">
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Need help getting started?
              </p>
              <div className="rounded-[24px] bg-white p-5 text-sm leading-7 text-[var(--color-ink)]">
                I want to open an account for my salary and everyday expenses.
              </div>
              <div className="rounded-[24px] bg-white p-5 text-sm leading-7 text-[var(--color-ink)]">
                The Everyday Plus Account may suit that requirement. It supports
                salary credits, digital payments and everyday banking. Would you
                like to review the account details or begin your application?
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="button" disabled={busy} onClick={startJourney}>
                  Begin application
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => router.push("/accounts/everyday-plus")}
                >
                  Review account
                </Button>
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
