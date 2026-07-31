import type { OnboardingStatus } from "@/lib/onboarding/types";
import { Card, SectionTitle } from "@/components/ui";
import { cn } from "@/lib/onboarding/utils";

const stages = [
  "Documents received",
  "Information extracted",
  "Details compared",
  "Identity checked",
  "Customer screening",
  "Final assessment",
];

function stageIndex(status: OnboardingStatus) {
  if (status === "VERIFYING_DOCUMENTS") {
    return 2;
  }
  if (status === "ADDRESS_CONFIRMATION_REQUIRED") {
    return 3;
  }
  if (status === "SCREENING_IN_PROGRESS") {
    return 4;
  }
  if (status === "ROUTINE_REVIEW") {
    return 5;
  }
  if (status === "CREATING_CUSTOMER" || status === "COMPLETED") {
    return 6;
  }
  return 1;
}

export function VerificationProgress({
  status,
}: {
  status: OnboardingStatus;
}) {
  const completeIndex = stageIndex(status);

  return (
    <Card className="space-y-6">
      <SectionTitle
        title="Verification progress"
        description="Backend state determines each stage and the interface stays customer-safe."
      />
      <div className="space-y-4" aria-live="polite">
        {stages.map((stage, index) => {
          const completed = index < completeIndex;
          const current = index + 1 === completeIndex;

          return (
            <div key={stage} className="flex items-center gap-4">
              <div
                className={cn(
                  "h-3 w-3 rounded-full transition",
                  completed && "bg-[var(--color-success)]",
                  current && "animate-pulse bg-[var(--color-primary)]",
                  !completed && !current && "bg-[var(--color-border-strong)]",
                )}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--color-ink)]">
                  {stage}
                </p>
                <div className="mt-2 h-2 rounded-full bg-[var(--color-surface-soft)]">
                  <div
                    className={cn(
                      "h-2 rounded-full transition-all",
                      completed || current
                        ? "bg-[var(--color-primary)]"
                        : "bg-transparent",
                    )}
                    style={{
                      width: completed ? "100%" : current ? "68%" : "0%",
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
