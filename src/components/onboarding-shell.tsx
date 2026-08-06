import type { ReactNode } from "react";

import type {
  OnboardingCaseView,
  OrchestrationMode,
} from "@/lib/onboarding/types";
import { CaseReferenceBadge } from "@/components/case-reference-badge";
import { JourneyProgress } from "@/components/journey-progress";
import { Card } from "@/components/ui";

/** Customer-facing name for each orchestration. */
const ORCHESTRATION_LABEL: Record<OrchestrationMode, string> = {
  "mock-pega": "Mock Pega",
  pega: "Pega",
  "non-pega": "AWS",
};

export function OnboardingShell({
  caseData,
  rightRail,
  children,
}: {
  caseData: OnboardingCaseView;
  rightRail: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-teal)]">
              Digital account opening
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--color-ink)]">
              Everyday Plus account application
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-ink-subtle)]">
              Complete your application with clear forms, secure document
              upload and timely status guidance along the way.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <CaseReferenceBadge
              label="Case ID"
              value={caseData.displayReference ?? caseData.caseId}
            />
            <CaseReferenceBadge
              label="Status"
              value={caseData.customerSafeStatus}
            />
            {/* Which system is running this application. Shown because the
                whole point of the switch is being able to tell them apart. */}
            <CaseReferenceBadge
              label="Running on"
              value={ORCHESTRATION_LABEL[caseData.orchestrationMode]}
            />
          </div>
        </div>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_400px]">
        <div className="space-y-6">{children}</div>
        <div className="space-y-6">
          <Card className="space-y-4">
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              Journey progress
            </p>
            <JourneyProgress progress={caseData.progress} />
          </Card>
          {rightRail}
        </div>
      </div>
    </div>
  );
}
