"use client";

import { useState } from "react";

import { Badge, Button, Card, SectionTitle, TextInput } from "@/components/ui";
import type { CapabilityComparison } from "@/lib/agents/compare";
import type { AgentDecisionRecord } from "@/lib/agents/contracts";
import type { IndustryId } from "@/lib/industry/types";

/**
 * Governance console.
 *
 * Shows how an answer was produced, not only what it said: which agent acted,
 * on which model and prompt version, whether it was grounded, and what the
 * governed path adds over answering alone.
 */

interface ComparisonResponse {
  correlationId: string;
  interpretation: {
    intent: string;
    confidence: number;
    reply: string;
    grounded?: boolean;
  };
  agentOnly: { outcome: string; limitations: string[] };
  governed: { outcome: string; adds: string[] };
  capabilities: CapabilityComparison[];
  records: AgentDecisionRecord[];
}

const INDUSTRIES: Array<{ id: IndustryId; label: string }> = [
  { id: "banking", label: "Banking" },
  { id: "insurance", label: "Insurance" },
  { id: "telecom", label: "Telecom" },
];

function Support({ value }: { value: "yes" | "no" | "partial" }) {
  const label = value === "yes" ? "Yes" : value === "no" ? "No" : "Partial";
  const tone =
    value === "yes"
      ? "text-[var(--color-success)]"
      : value === "no"
        ? "text-[var(--color-error)]"
        : "text-[var(--color-ink-subtle)]";

  return <span className={`text-sm font-medium ${tone}`}>{label}</span>;
}

export function GovernanceConsole() {
  const [message, setMessage] = useState(
    "I want to open an account for my salary",
  );
  const [industryId, setIndustryId] = useState<IndustryId>("banking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ComparisonResponse | null>(null);

  async function run() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/agents/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, industryId }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.message || "Unable to run the comparison.");
        return;
      }

      setResult(payload);
    } catch {
      setError("Unable to reach the agent service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        <SectionTitle
          eyebrow="AI governance"
          title="Agent-only versus governed execution"
          description="One customer request, interpreted once, then run down both paths. The interpretation is shared so the difference shown is architectural, not two samples of the same model."
        />

        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <TextInput
            aria-label="Customer request"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <select
            aria-label="Industry"
            className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm"
            value={industryId}
            onChange={(event) =>
              setIndustryId(event.target.value as IndustryId)
            }
          >
            {INDUSTRIES.map((industry) => (
              <option key={industry.id} value={industry.id}>
                {industry.label}
              </option>
            ))}
          </select>
          <Button type="button" disabled={busy || !message.trim()} onClick={run}>
            {busy ? "Running…" : "Run comparison"}
          </Button>
        </div>

        {error ? (
          <p className="rounded-2xl bg-[#FEE4E2] px-4 py-3 text-sm text-[var(--color-error)]">
            {error}
          </p>
        ) : null}
      </Card>

      {result ? (
        <>
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge>{result.interpretation.intent}</Badge>
              <span className="text-sm text-[var(--color-ink-subtle)]">
                confidence {(result.interpretation.confidence * 100).toFixed(0)}%
              </span>
              {result.interpretation.grounded !== undefined ? (
                <span className="text-sm text-[var(--color-ink-subtle)]">
                  {result.interpretation.grounded
                    ? "grounded in approved material"
                    : "not grounded — deferred to the team"}
                </span>
              ) : null}
            </div>
            <p className="rounded-2xl bg-[var(--color-surface-soft)] px-4 py-3 text-sm leading-6">
              {result.interpretation.reply}
            </p>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="space-y-3">
              <p className="text-sm font-semibold">Agent only</p>
              <p className="text-sm leading-6 text-[var(--color-ink-subtle)]">
                {result.agentOnly.outcome}
              </p>
              <ul className="space-y-2 text-sm text-[var(--color-ink-subtle)]">
                {result.agentOnly.limitations.map((item) => (
                  <li key={item}>— {item}</li>
                ))}
              </ul>
            </Card>

            <Card className="space-y-3">
              <p className="text-sm font-semibold">Governed execution</p>
              <p className="text-sm leading-6 text-[var(--color-ink-subtle)]">
                {result.governed.outcome}
              </p>
              <ul className="space-y-2 text-sm text-[var(--color-ink-subtle)]">
                {result.governed.adds.map((item) => (
                  <li key={item}>— {item}</li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="space-y-4">
            <p className="text-sm font-semibold">Capability comparison</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-[var(--color-ink-subtle)]">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Dimension</th>
                    <th className="py-2 pr-4 font-medium">Agent only</th>
                    <th className="py-2 pr-4 font-medium">Governed</th>
                    <th className="py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {result.capabilities.map((row) => (
                    <tr
                      key={row.dimension}
                      className="border-t border-[var(--color-border)]"
                    >
                      <td className="py-2 pr-4">{row.dimension}</td>
                      <td className="py-2 pr-4">
                        <Support value={row.agentOnly} />
                      </td>
                      <td className="py-2 pr-4">
                        <Support value={row.governed} />
                      </td>
                      <td className="py-2 text-[var(--color-ink-subtle)]">
                        {row.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="space-y-4">
            <p className="text-sm font-semibold">
              AI action ledger — {result.correlationId}
            </p>
            <div className="space-y-3">
              {result.records.map((record, index) => (
                <div
                  key={`${record.actor}-${index}`}
                  className="rounded-2xl border border-[var(--color-border)] p-4 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge>{record.actor}</Badge>
                    <span className="text-[var(--color-ink-subtle)]">
                      {record.outcome}
                    </span>
                    <span className="text-[var(--color-ink-subtle)]">
                      {record.latencyMs} ms
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-[var(--color-ink-subtle)] sm:grid-cols-2">
                    <div>
                      provider:{" "}
                      <span className="text-[var(--color-ink)]">
                        {record.provider}
                      </span>
                    </div>
                    <div>
                      model:{" "}
                      <span className="text-[var(--color-ink)]">
                        {record.modelId ?? "—"}
                      </span>
                    </div>
                    <div>
                      prompt:{" "}
                      <span className="text-[var(--color-ink)]">
                        {record.promptTemplateId} v{record.promptVersion}
                      </span>
                    </div>
                    <div>
                      pack:{" "}
                      <span className="text-[var(--color-ink)]">
                        {record.industryId} v{record.packVersion}
                      </span>
                    </div>
                    {record.grounded !== undefined ? (
                      <div>
                        grounded:{" "}
                        <span className="text-[var(--color-ink)]">
                          {String(record.grounded)}
                        </span>
                      </div>
                    ) : null}
                    {record.failureReason ? (
                      <div className="sm:col-span-2 text-[var(--color-error)]">
                        {record.failureReason}
                      </div>
                    ) : null}
                  </dl>
                </div>
              ))}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
