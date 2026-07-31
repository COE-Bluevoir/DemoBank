"use client";

import { useEffect, useState, useTransition } from "react";

import type {
  DemoExecutionEvent,
  DemoSettings,
  OnboardingCaseView,
  OrchestrationMode,
  ScenarioId,
} from "@/lib/onboarding/types";
import { formatDateTime } from "@/lib/onboarding/utils";
import { CaseReferenceBadge } from "@/components/case-reference-badge";
import { DemoEventDrawer } from "@/components/demo-event-drawer";
import { Button, Card, SectionTitle, SelectInput } from "@/components/ui";

export function DemoControlPanel({
  initialCase,
  initialEvents,
  settings,
  scenarioOptions,
  modeOptions,
}: {
  initialCase: OnboardingCaseView | null;
  initialEvents: DemoExecutionEvent[];
  settings: DemoSettings;
  scenarioOptions: Array<{ id: ScenarioId; label: string; description: string }>;
  modeOptions: Array<{
    id: OrchestrationMode;
    label: string;
    description: string;
  }>;
}) {
  const [caseData, setCaseData] = useState(initialCase);
  const [events, setEvents] = useState(initialEvents);
  const [mode, setMode] = useState(settings.orchestrationMode);
  const [scenario, setScenario] = useState(settings.scenarioId);
  const [copyState, setCopyState] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function refreshCurrentCase() {
    const response = await fetch("/api/demo/current", { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    setCaseData(payload.caseView ?? null);
    setEvents(payload.events ?? []);
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshCurrentCase();
    }, 2200);

    return () => window.clearInterval(interval);
  }, []);

  async function callCaseControl(path: string) {
    if (!caseData?.caseId) {
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/demo/cases/${caseData.caseId}/${path}`, {
        method: "POST",
      });
      if (response.ok) {
        const payload = await response.json();
        setCaseData(payload.caseView);
        setEvents(payload.events);
      }
    });
  }

  async function updateModeSelection(value: OrchestrationMode) {
    setMode(value);
    await fetch("/api/demo/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orchestrationMode: value }),
    });
  }

  async function updateScenarioSelection(value: ScenarioId) {
    setScenario(value);
    await fetch("/api/demo/scenario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: value }),
    });
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-6">
        <SectionTitle
          eyebrow="Presenter control"
          title="Demo control"
          description="Manage the deterministic mock scenario, orchestration mode and review state without exposing internal details in the customer journey."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-[var(--color-ink)]">Scenario</span>
            <SelectInput
              value={scenario}
              onChange={(event) =>
                updateScenarioSelection(event.target.value as ScenarioId)
              }
            >
              {scenarioOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </SelectInput>
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-[var(--color-ink)]">
              Orchestration mode
            </span>
            <SelectInput
              value={mode}
              onChange={(event) =>
                updateModeSelection(event.target.value as OrchestrationMode)
              }
            >
              {modeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </SelectInput>
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" disabled={!caseData || isPending} onClick={() => callCaseControl("reset")}>
            Reset demo data
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!caseData || isPending}
            onClick={() => callCaseControl("advance")}
          >
            Advance mock processing
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!caseData || isPending}
            onClick={() => callCaseControl("clear-review")}
          >
            Clear review
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={!caseData || isPending}
            onClick={() => callCaseControl("force-timeout")}
          >
            Force timeout
          </Button>
          <Button type="button" variant="ghost" onClick={() => refreshCurrentCase()}>
            Refresh
          </Button>
        </div>
      </Card>

      <Card className="space-y-4">
        <SectionTitle
          title="Current demo case"
          description={
            caseData
              ? "Neutral presenter-facing case details."
              : "Start a customer journey to populate the current demo case."
          }
        />
        {caseData ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <CaseReferenceBadge label="Case ID" value={caseData.caseId} />
              <CaseReferenceBadge
                label="Case version"
                value={String(caseData.caseVersion)}
              />
              <CaseReferenceBadge
                label="Correlation ID"
                value={caseData.correlationId}
              />
              <CaseReferenceBadge
                label="Mode"
                value={caseData.orchestrationMode}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <CaseReferenceBadge
                label="Customer-safe state"
                value={caseData.customerSafeStatus}
              />
              <CaseReferenceBadge
                label="Scenario"
                value={caseData.scenarioId}
              />
              <CaseReferenceBadge
                label="Last updated"
                value={formatDateTime(caseData.lastUpdatedAt)}
              />
              <CaseReferenceBadge
                label="Last action"
                value={caseData.currentAction?.label || "Waiting"}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(caseData.caseId);
                  setCopyState("Case ID copied");
                }}
              >
                Copy case ID
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(caseData.correlationId);
                  setCopyState("Correlation ID copied");
                }}
              >
                Copy correlation ID
              </Button>
              {copyState ? (
                <span className="self-center text-sm text-[var(--color-ink-subtle)]">
                  {copyState}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--color-ink-subtle)]">
            No current case yet.
          </p>
        )}
      </Card>

      <DemoEventDrawer events={events} />
    </div>
  );
}
