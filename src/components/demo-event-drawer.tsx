"use client";

import { useState } from "react";

import type { DemoExecutionEvent } from "@/lib/onboarding/types";
import { formatDateTime } from "@/lib/onboarding/utils";
import { Button, Card } from "@/components/ui";

export function DemoEventDrawer({
  events,
}: {
  events: DemoExecutionEvent[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            Neutral integration events
          </p>
          <p className="text-sm text-[var(--color-ink-subtle)]">
            Presenter-facing execution timeline for the current case.
          </p>
        </div>
        <Button variant="secondary" type="button" onClick={() => setOpen((value) => !value)}>
          {open ? "Hide events" : "Show events"}
        </Button>
      </div>
      {open ? (
        <div className="space-y-3">
          {events.map((event) => (
            <div
              key={event.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                  {event.displayName}
                </p>
                <span className="text-xs text-[var(--color-ink-muted)]">
                  {formatDateTime(event.timestamp)}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--color-ink-subtle)]">
                {event.summary}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
