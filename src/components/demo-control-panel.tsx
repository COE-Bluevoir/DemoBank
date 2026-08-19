"use client";

import { useEffect, useState, useTransition } from "react";

import type {
  DemoExecutionEvent,
  DemoSettings,
  OnboardingCaseView,
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
}: {
  initialCase: OnboardingCaseView | null;
  initialEvents: DemoExecutionEvent[];
  settings: DemoSettings;
  scenarioOptions: Array<{ id: ScenarioId; label: string; description: string }>;
}) {
  const [caseData, setCaseData] = useState(initialCase);
  const [events, setEvents] = useState(initialEvents);
  const [scenario, setScenario] = useState(settings.scenarioId);
  const [pegaDemoMode, setPegaDemoMode] = useState(
    settings.pegaDemoModeEnabled,
  );
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

  async function updateScenarioSelection(value: ScenarioId) {
    setScenario(value);
    await fetch("/api/demo/scenario", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: value }),
    });
  }

  async function updatePegaDemoModeSelection(value: boolean) {
    setPegaDemoMode(value);
    await fetch("/api/demo/pega-demo-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: value }),
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
          <div className="space-y-2 text-sm">
            <span className="font-medium text-[var(--color-ink)]">
              Orchestration mode
            </span>
            <p className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-soft)] px-4 py-3 text-sm text-[var(--color-ink)]">
              {settings.orchestrationMode} — fixed for this deployment
            </p>
          </div>
        </div>
        <label className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={pegaDemoMode}
            onChange={(event) => updatePegaDemoModeSelection(event.target.checked)}
          />
          <span>
            <span className="block font-medium text-[var(--color-ink)]">
              Pega scripted drive
            </span>
            <span className="block text-[var(--color-ink-subtle)]">
              Case creation, consent and document upload still call Pega for
              real. After that, this app mirrors Arjun Mehta&apos;s
              ground-truth extraction and screening results directly onto the
              real case and jumps its stage forward, instead of waiting on
              the live GenAI extraction/screening agents. The real case ends
              up consistent with what the customer sees. Off runs every step
              through Pega&apos;s live agents.
            </span>
          </span>
        </label>
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
              <CaseReferenceBadge
                label="Case ID"
                value={caseData.displayReference ?? caseData.caseId}
              />
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
