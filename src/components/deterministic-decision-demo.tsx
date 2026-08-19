"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDown, Gavel, ShieldOff } from "lucide-react";

import { Badge, Button, Card, SectionTitle } from "@/components/ui";

interface Result {
  question: string;
  ungrounded: { text: string; model: string };
  pega: { text: string; source: string };
}

/**
 * "Does it get to make the important calls?" — no, a named rule does.
 *
 * Same visual pattern as the hallucination demo, deliberately, so the two
 * read as one family of proof rather than different UIs to learn. The AI
 * side is a genuine live call. The Pega side is a fixed example — see
 * lib/agents/decision-demo.ts for the reason (a real, ticketed platform
 * bug currently blocks reading the real rule's output live) if it ever
 * needs picking back up.
 */
export function DeterministicDecisionDemo() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/agents/decision-demo", { method: "POST" });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.message || "Unable to run the comparison.");
        return;
      }

      setResult(payload);
    } catch {
      setError("Unable to reach the assistant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-5">
      <SectionTitle
        eyebrow="Does it get to make the important calls?"
        title="A named rule decides — not an AI's judgment call"
        description="Ask an AI whether an application needs human review, and it'll improvise a plausible-sounding answer — exactly the kind of decision that shouldn't be delegated to a guess. Pega's rule gives the same answer every time instead."
      />

      <Button type="button" disabled={busy} onClick={run}>
        {busy ? "Asking both…" : "Ask both"}
      </Button>

      {error ? (
        <p className="rounded-2xl bg-[#FEE4E2] px-4 py-3 text-sm text-[var(--color-error)]">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="flex flex-col items-stretch gap-0">
          <div className="space-y-3 rounded-t-[20px] border border-b-0 border-[var(--color-error)]/30 bg-[#FEF4F3] p-5">
            <div className="flex items-center gap-2">
              <ShieldOff className="h-4 w-4 text-[var(--color-error)]" />
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                AI&apos;s judgment call
              </p>
              <Badge tone="error">Improvised</Badge>
            </div>
            <p className="whitespace-pre-line text-sm leading-6 text-[var(--color-ink)]">
              {result.ungrounded.text}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]">
              <AlertTriangle className="h-3.5 w-3.5" />
              {result.ungrounded.model} · live call, no rule behind it —
              ask again and the wording (or the verdict) can change.
            </p>
          </div>

          <div className="z-10 mx-auto -my-3 flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-white px-4 py-1.5 shadow-sm">
            <ArrowDown className="h-3.5 w-3.5 text-[var(--color-navy)]" />
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-navy)]">
              A named rule decides instead
            </p>
          </div>

          <div className="space-y-3 rounded-b-[20px] border border-t-0 border-[var(--color-navy)]/25 bg-[#F4F7FB] p-5">
            <div className="flex items-center gap-2">
              <Gavel className="h-4 w-4 text-[var(--color-navy)]" />
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Pega&apos;s rule decides
              </p>
              <Badge tone="info">Same answer, every time</Badge>
            </div>
            <p className="whitespace-pre-line text-sm leading-6 text-[var(--color-ink)]">
              {result.pega.text}
            </p>
            <p className="text-xs text-[var(--color-ink-muted)]">
              source: {result.pega.source} · rule-based, not a model — the
              identical question gets the identical answer every time.
            </p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
