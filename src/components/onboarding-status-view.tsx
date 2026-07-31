"use client";

import { useCallback, useEffect, useState } from "react";

import { CaseReferenceBadge } from "@/components/case-reference-badge";
import { JourneyProgress } from "@/components/journey-progress";
import { Button, Card, SectionTitle } from "@/components/ui";
import type { OnboardingCaseView } from "@/lib/onboarding/types";
import { formatDateTime } from "@/lib/onboarding/utils";

export function OnboardingStatusView({
  initialCase,
}: {
  initialCase: OnboardingCaseView;
}) {
  const [caseData, setCaseData] = useState(initialCase);

  const refreshCase = useCallback(async () => {
    const response = await fetch(`/api/onboarding/cases/${caseData.caseId}/status`, {
      cache: "no-store",
    });
    if (response.ok) {
      setCaseData(await response.json());
    }
  }, [caseData.caseId]);

  useEffect(() => {
    if (
      ![
        "VERIFYING_DOCUMENTS",
        "SCREENING_IN_PROGRESS",
        "ROUTINE_REVIEW",
        "CREATING_CUSTOMER",
      ].includes(caseData.status)
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshCase();
    }, 2400);

    return () => window.clearInterval(interval);
  }, [caseData.caseId, caseData.status, refreshCase]);

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <SectionTitle
          eyebrow="Customer-safe status"
          title={caseData.customerSafeStatus}
          description={
            caseData.statusDetail ||
            "Refresh this page at any time. The current stage is always loaded from the backend."
          }
        />
        <div className="grid gap-4 rounded-[28px] bg-[var(--color-surface-soft)] p-5 md:grid-cols-3">
          <CaseReferenceBadge label="Case reference" value={caseData.caseId} />
          <CaseReferenceBadge
            label="Status"
            value={caseData.customerSafeStatus}
          />
          <CaseReferenceBadge
            label="Last updated"
            value={formatDateTime(caseData.lastUpdatedAt)}
          />
        </div>
        <Button type="button" onClick={() => refreshCase()}>
          Refresh status
        </Button>
      </Card>

      <Card className="space-y-4">
        <p className="text-sm font-semibold text-[var(--color-ink)]">
          Progress
        </p>
        <JourneyProgress progress={caseData.progress} />
      </Card>
    </div>
  );
}
