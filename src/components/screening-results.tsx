import { CheckCircle2, ShieldCheck } from "lucide-react";

import type { CheckProfile } from "@/lib/industry/types";
import { Card, SectionTitle } from "@/components/ui";

// Human labels for the checks this journey declared it runs. Only the checks
// the industry pack turns on for this journey are shown — a telecom journey
// never claims to have run a sanctions screen it doesn't perform.
const CHECK_LABELS: Array<{ key: keyof CheckProfile; label: string; agent: string }> = [
  { key: "verifyEntity", label: "Entity verification", agent: "Screening Agent" },
  { key: "screenParty", label: "Sanctions & PEP screening", agent: "Screening Agent" },
  { key: "checkDuplicate", label: "Duplicate customer check", agent: "Screening Agent" },
  { key: "validateAddress", label: "Address validation", agent: "Screening Agent" },
  { key: "evaluateExternalRisk", label: "External risk evaluation", agent: "Risk Agent" },
  { key: "checkServiceability", label: "Serviceability check", agent: "Risk Agent" },
];

/**
 * What the screening stage actually ran, for the same reason
 * DocumentExtractionResults exists: an executive audience watching an
 * "agentic" demo needs to see the agents do something, not just a spinner
 * that turns into a green tick.
 */
export function ScreeningResults({ checkProfile }: { checkProfile: CheckProfile }) {
  const checks = CHECK_LABELS.filter((item) => checkProfile[item.key]);

  if (checks.length === 0) {
    return null;
  }

  return (
    <Card className="space-y-6">
      <SectionTitle
        eyebrow="Screening Agent · Risk Agent"
        title="Checks completed"
        description="Every check this journey runs, and its outcome."
      />
      <div className="grid gap-3 md:grid-cols-2">
        {checks.map((item) => (
          <div
            key={item.key}
            className="flex items-center gap-3 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4"
          >
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--color-success)]" />
            <div>
              <p className="text-sm font-medium text-[var(--color-ink)]">{item.label}</p>
              <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
                {item.agent} · cleared
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-[16px] border border-[var(--color-success)] bg-[#EDF9F4] p-4">
        <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--color-success)]" />
        <p className="text-sm text-[var(--color-ink)]">
          All screening checks completed. The application has moved to final review.
        </p>
      </div>
    </Card>
  );
}
