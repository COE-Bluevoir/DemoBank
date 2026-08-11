import Link from "next/link";

import { getIndustryPack } from "@/lib/industry/registry";
import type { OnboardingCaseView } from "@/lib/onboarding/types";
import { formatDateTime } from "@/lib/onboarding/utils";
import { CaseReferenceBadge } from "@/components/case-reference-badge";
import { Button, Card, SectionTitle } from "@/components/ui";

export function SuccessSummary({
  caseData,
}: {
  caseData: OnboardingCaseView;
}) {
  const pack = getIndustryPack(caseData.industryId);
  const { terminology, brand } = pack;

  return (
    <Card className="space-y-6">
      <SectionTitle
        eyebrow="Welcome"
        title={`${terminology.completionHeading}, ${caseData.applicant?.firstName || terminology.customerNoun}.`}
        // "opened" for a bank, "issued" for a policy, "activated" for a
        // service — the same screen has to close three different journeys.
        description={`Your ${caseData.outcome?.productName || brand.productName} has been ${terminology.activationVerb} successfully.`}
      />
      <div className="grid gap-4 rounded-[28px] bg-[var(--color-surface-soft)] p-5 md:grid-cols-2">
        <CaseReferenceBadge
          label="Customer reference"
          value={caseData.outcome?.customerReference || "-"}
        />
        <CaseReferenceBadge
          label={`${terminology.productNoun.replace(/^./, (c) => c.toUpperCase())} reference`}
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
