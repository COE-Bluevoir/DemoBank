import { CheckCircle2, Circle, Clock3, TriangleAlert } from "lucide-react";

import type { OnboardingCaseView } from "@/lib/onboarding/types";
import { cn } from "@/lib/onboarding/utils";

export function JourneyProgress({
  progress,
}: {
  progress: OnboardingCaseView["progress"];
}) {
  return (
    <ol className="space-y-3" aria-label="Journey progress">
      {progress.steps.map((step) => {
        const icon =
          step.state === "completed" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : step.state === "attention" ? (
            <TriangleAlert className="h-4 w-4" />
          ) : step.state === "current" ? (
            <Clock3 className="h-4 w-4" />
          ) : (
            <Circle className="h-4 w-4" />
          );

        return (
          <li
            key={step.id}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm",
              step.state === "completed" &&
                "bg-[#EAF9F0] text-[var(--color-success)]",
              step.state === "current" &&
                "bg-[#EAF3F8] text-[var(--color-primary)]",
              step.state === "attention" &&
                "bg-[#FFF0C7] text-[var(--color-warning)]",
              step.state === "not-started" &&
                "bg-[var(--color-surface-soft)] text-[var(--color-ink-muted)]",
            )}
          >
            {icon}
            <span className="font-medium">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
