"use client";

import type { OrchestrationMode } from "@/lib/onboarding/types";

/**
 * Chooses which system runs the application.
 *
 * The two options are complete, mutually exclusive implementations of the same
 * journey, so this is a genuine fork rather than a display preference. The
 * choice is made before the application opens and then travels with it: a case
 * belongs to the orchestration that created it for the rest of its life.
 */

export interface OrchestrationChoice {
  id: OrchestrationMode;
  label: string;
  description: string;
  /** Absent when the environment cannot run this option. */
  unavailableReason?: string;
}

export function OrchestrationSwitch({
  choices,
  value,
  onChange,
  disabled = false,
}: {
  choices: OrchestrationChoice[];
  value: OrchestrationMode;
  onChange: (mode: OrchestrationMode) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset
      className="space-y-3"
      // A journey in flight must not have the ground moved under it.
      disabled={disabled}
    >
      <legend className="text-sm font-semibold text-[var(--color-ink)]">
        Run this application on
      </legend>

      <div className="grid gap-3 sm:grid-cols-2">
        {choices.map((choice) => {
          const selected = choice.id === value;
          const unavailable = Boolean(choice.unavailableReason);

          return (
            <label
              key={choice.id}
              className={[
                "flex cursor-pointer flex-col gap-1 rounded-[20px] border p-4 transition",
                selected
                  ? "border-[var(--color-accent)] bg-[var(--color-surface-soft)] shadow-sm"
                  : "border-[var(--color-border)] bg-white",
                unavailable || disabled ? "cursor-not-allowed opacity-60" : "",
              ].join(" ")}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="orchestration-mode"
                  value={choice.id}
                  checked={selected}
                  disabled={unavailable || disabled}
                  onChange={() => onChange(choice.id)}
                  className="h-4 w-4 accent-[var(--color-accent)]"
                  // The option's name is the option, not its explanation.
                  // Letting the wrapping label supply the name would fold the
                  // description in, and each description mentions the other
                  // system — leaving neither option distinguishable by name.
                  aria-label={choice.label}
                  aria-describedby={`orchestration-${choice.id}-description`}
                />
                <span className="text-sm font-semibold text-[var(--color-ink)]">
                  {choice.label}
                </span>
              </span>

              <span
                id={`orchestration-${choice.id}-description`}
                className="pl-6 text-xs leading-5 text-[var(--color-ink-subtle)]"
              >
                {/* Saying why an option cannot be picked is more useful than
                    hiding it: the reason is usually a missing credential. */}
                {choice.unavailableReason ?? choice.description}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
