"use client";

import { useState } from "react";
import { CheckCircle2, ShieldAlert, XCircle } from "lucide-react";

import { Badge, Button, Card, SectionTitle } from "@/components/ui";

interface Result {
  caseId: string;
  rejected: {
    attemptedContent: Record<string, unknown>;
    statusCode: number;
    pegaError: string;
  };
  accepted: {
    attemptedContent: Record<string, unknown>;
    statusCode: number;
  };
}

/**
 * Proves Pega's own case-view contract enforces itself — live, against a
 * real case created on the spot.
 *
 * A different claim than the hallucination demo: that one shows Pega has
 * the right fact (grounding). This one shows Pega structurally rejects a
 * malformed submission regardless of what a caller sends — process
 * integrity enforced by Pega itself, not by this app behaving well. See
 * lib/pega/workflow-governance-demo.ts for why the "invalid" shape used
 * here is a real, previously-confirmed failure, not a contrived one.
 */
export function WorkflowGovernanceDemo() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/agents/workflow-governance-demo", {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.message || "Unable to run the check.");
        return;
      }

      setResult(payload);
    } catch {
      setError("Unable to reach Pega.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-5">
      <SectionTitle
        eyebrow="Not asserted — attempted, live, against a real case"
        title="Pega enforces its own data contract"
        description="Submit a malformed request and a well-formed one, both against a case created on the spot. Pega's own view rules decide what's accepted — this app cannot talk its way past them."
      />

      <Button type="button" disabled={busy} onClick={run}>
        {busy ? "Running against Pega…" : "Run this check"}
      </Button>

      {error ? (
        <p className="rounded-2xl bg-[#FEE4E2] px-4 py-3 text-sm text-[var(--color-error)]">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="space-y-4">
          <div className="space-y-3 rounded-[20px] border border-[var(--color-error)]/30 bg-[#FEF4F3] p-5">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-[var(--color-error)]" />
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Invalid submission
              </p>
              <Badge tone="error">
                Rejected · HTTP {result.rejected.statusCode}
              </Badge>
            </div>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Sent nested sub-fields Pega&apos;s view has never accepted:
            </p>
            <pre className="overflow-x-auto rounded-xl bg-white p-3 text-xs text-[var(--color-ink)]">
              {JSON.stringify(result.rejected.attemptedContent, null, 2)}
            </pre>
            <p className="text-xs leading-5 text-[var(--color-ink-muted)]">
              Pega&apos;s response: {result.rejected.pegaError}
            </p>
          </div>

          <div className="space-y-3 rounded-[20px] border border-[var(--color-success)]/30 bg-[#EDF9F4] p-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[var(--color-success)]" />
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Well-formed submission
              </p>
              <Badge tone="success">
                Accepted · HTTP {result.accepted.statusCode}
              </Badge>
            </div>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Same case, same action, only the shape changed:
            </p>
            <pre className="overflow-x-auto rounded-xl bg-white p-3 text-xs text-[var(--color-ink)]">
              {JSON.stringify(result.accepted.attemptedContent, null, 2)}
            </pre>
          </div>

          <p className="flex items-start gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-3 text-xs leading-5 text-[var(--color-ink-subtle)]">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-navy)]" />
            <span>
              Case <code className="text-[var(--color-ink)]">{result.caseId}</code>,
              created for this check. Same request shape, same result, every
              time — the contract lives in Pega&apos;s case view, not in
              anything this app decided to enforce.
            </span>
          </p>
        </div>
      ) : null}
    </Card>
  );
}
