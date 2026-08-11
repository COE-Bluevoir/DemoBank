"use client";

import type { OnboardingCaseView } from "@/lib/onboarding/types";
import { Button, Card, SectionTitle } from "@/components/ui";

/**
 * Puts a commercial change back to the customer.
 *
 * What can be delivered at the site differs from what was ordered. Nothing may
 * apply that difference on the customer's behalf — they bought a specific
 * service, and accepting less is their decision, not a provider's and not the
 * workflow's. This screen exists so that decision is made explicitly, by them.
 */
export function AlternativeOffer({
  caseData,
  busy,
  onAccept,
}: {
  caseData: OnboardingCaseView;
  busy?: boolean;
  onAccept: () => void;
}) {
  const evidence = caseData.pendingChoice?.evidence ?? {};
  const requested = evidence.requestedMbps;
  const available = evidence.availableMbps;

  return (
    <Card className="space-y-6">
      <SectionTitle
        title="Confirm your service"
        description="The service available at your site differs from the one on your order. Your application will not continue until you tell us how you would like to proceed."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            You ordered
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">
            {typeof requested === "number" ? `${requested} Mbps` : "As ordered"}
          </p>
        </div>
        <div className="rounded-[24px] border-2 border-[var(--color-accent)] bg-[var(--color-surface-soft)] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            Available at your site
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">
            {typeof available === "number" ? `${available} Mbps` : "Alternative"}
          </p>
        </div>
      </div>

      {typeof evidence.earliestUpgrade === "string" ? (
        <p className="text-sm text-[var(--color-ink-subtle)]">
          Capacity for the service you originally ordered is expected to become
          available from {evidence.earliestUpgrade}.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={busy} onClick={onAccept}>
          Accept the available service
        </Button>
        <p className="text-sm text-[var(--color-ink-subtle)]">
          {/* No decline button: withdrawing an application is a different
              action with different consequences, and is handled by support
              rather than buried beside an accept button. */}
          If you would rather keep your original order, contact us and we will
          hold your application.
        </p>
      </div>
    </Card>
  );
}
