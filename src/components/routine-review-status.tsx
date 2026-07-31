import { CaseReferenceBadge } from "@/components/case-reference-badge";
import { formatDateTime } from "@/lib/onboarding/utils";
import { Button, Card, SectionTitle } from "@/components/ui";

export function RoutineReviewStatus({
  caseId,
  status,
  lastUpdatedAt,
  onRefresh,
  busy,
}: {
  caseId: string;
  status: string;
  lastUpdatedAt: string;
  onRefresh: () => void;
  busy?: boolean;
}) {
  return (
    <Card className="space-y-6">
      <SectionTitle
        title="Routine review"
        description="Your information has been received successfully. One of our onboarding specialists needs to complete a routine review. You do not need to take any further action at this time."
      />
      <div className="grid gap-4 rounded-[28px] bg-[var(--color-surface-soft)] p-5 md:grid-cols-3">
        <CaseReferenceBadge label="Case reference" value={caseId} />
        <CaseReferenceBadge label="Current status" value={status} />
        <CaseReferenceBadge
          label="Last updated"
          value={formatDateTime(lastUpdatedAt)}
        />
      </div>
      <Button type="button" onClick={onRefresh} disabled={busy}>
        Check status
      </Button>
    </Card>
  );
}
