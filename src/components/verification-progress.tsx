import { Bot, ShieldCheck, Landmark, FileSearch } from "lucide-react";

import type { OnboardingStatus } from "@/lib/onboarding/types";
import { Card, SectionTitle } from "@/components/ui";
import { cn } from "@/lib/onboarding/utils";

// Named after the Pega agent/service actually doing the work at each stage,
// so the customer-safe wait screen still shows an executive audience what
// the agentic orchestration is doing behind the scenes.
const stages = [
  {
    label: "Documents received",
    agent: "Document repository",
    icon: FileSearch,
  },
  {
    label: "Information extracted",
    agent: "Document Extraction Agent · GenAI",
    icon: Bot,
  },
  {
    label: "Details compared",
    agent: "Document Extraction Agent · GenAI",
    icon: Bot,
  },
  {
    label: "Identity checked",
    agent: "Identity Verification Agent",
    icon: Bot,
  },
  {
    label: "Customer screening",
    agent: "Screening Agent · KYC, AML & sanctions",
    icon: ShieldCheck,
  },
  {
    label: "Final assessment",
    agent: "Risk Agent · external risk services",
    icon: Landmark,
  },
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
        description="Behind the scenes, Pega's agents are working the case. Backend state determines each stage and the interface stays customer-safe."
      />
      <div className="space-y-4" aria-live="polite">
        {stages.map((stage, index) => {
          const completed = index < completeIndex;
          const current = index + 1 === completeIndex;
          const Icon = stage.icon;

          return (
            <div key={stage.label} className="flex items-center gap-4">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition",
                  completed && "bg-[var(--color-success)] text-white",
                  current && "animate-pulse bg-[var(--color-primary)] text-white",
                  !completed &&
                    !current &&
                    "bg-[var(--color-surface-soft)] text-[var(--color-ink-muted)]",
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p className="text-sm font-medium text-[var(--color-ink)]">
                    {stage.label}
                  </p>
                  {(completed || current) && (
                    <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
                      {stage.agent}
                    </span>
                  )}
                </div>
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
