import Link from "next/link";

import type { OnboardingCaseView } from "@/lib/onboarding/types";
import { formatDateTime } from "@/lib/onboarding/utils";
import { CaseReferenceBadge } from "@/components/case-reference-badge";
import { Button, Card, SectionTitle } from "@/components/ui";

export function SuccessSummary({
  caseData,
}: {
  caseData: OnboardingCaseView;
}) {
  return (
    <Card className="space-y-6">
      <SectionTitle
        eyebrow="Welcome"
        title={`Welcome to NorthStar Bank, ${caseData.applicant?.fullName?.split(" ")[0] || "customer"}.`}
        description={`Your ${caseData.outcome?.productName || "account"} has been opened successfully.`}
      />
      <div className="grid gap-4 rounded-[28px] bg-[var(--color-surface-soft)] p-5 md:grid-cols-2">
        <CaseReferenceBadge
          label="Customer reference"
          value={caseData.outcome?.customerReference || "-"}
        />
        <CaseReferenceBadge
          label="Account reference"
          value={caseData.outcome?.accountReference || "-"}
        />
        <CaseReferenceBadge
          label="Product"
          value={caseData.outcome?.productName || "-"}
        />
        <CaseReferenceBadge
          label="Completion date"
          value={formatDateTime(caseData.lastUpdatedAt)}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => {
            window.alert("Demo complete");
          }}
        >
          Activate digital banking
        </Button>
        <Link href="/">
          <Button variant="secondary" type="button">
            Return to home
          </Button>
        </Link>
      </div>
    </Card>
  );
}
