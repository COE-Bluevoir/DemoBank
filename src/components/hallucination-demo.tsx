"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDown, ShieldCheck, ShieldOff } from "lucide-react";

import { HALLUCINATION_QUESTIONS } from "@/lib/agents/hallucination-questions";
import type { IndustryId } from "@/lib/industry/types";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";

interface Result {
  question: string;
  correction: string;
  ungrounded: { text: string; model: string };
  governed: { text: string; source: string; answered: boolean };
}

/**
 * Hallucinate, then watch Pega catch it — live.
 *
 * Both questions reproduce a real failure caught in this app's own chat
 * widget earlier: asked with no document list or product data to ground it,
 * the same model that answers correctly elsewhere invents US business-
 * banking requirements for an Indian bank, and a specific interest rate for
 * a product that has none on file. The point being demonstrated isn't "the
 * model is bad" — it's what plugging an LLM into an enterprise process
 * safely actually requires: a governed, deterministic layer that catches
 * and corrects exactly this class of failure before it reaches a customer.
 */
export function HallucinationDemo({
  industryId = "banking",
}: {
  industryId?: IndustryId;
}) {
  const [questionId, setQuestionId] = useState(HALLUCINATION_QUESTIONS[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/agents/hallucination-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, industryId }),
      });
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
        eyebrow="Step 1: it hallucinates. Step 2: Pega catches it."
        title="Plugging AI into an enterprise, safely"
        description="Ask the identical question two ways: a raw model with no guardrails, then the same question through governed, deterministic execution. Both run live — nothing here is scripted text."
      />

      <div className="flex flex-wrap items-center gap-3">
        {HALLUCINATION_QUESTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setQuestionId(item.id);
              setResult(null);
            }}
            className={[
              "rounded-full border px-4 py-2 text-sm font-medium transition",
              questionId === item.id
                ? "border-[var(--color-navy)] bg-[var(--color-navy)] text-white"
                : "border-[var(--color-border-strong)] text-[var(--color-ink)] hover:border-[var(--color-ink)]",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
        <Button type="button" disabled={busy} onClick={run}>
          {busy ? "Asking both…" : "Ask both"}
        </Button>
      </div>

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
                Step 1 — outside LLM, no guardrails
              </p>
              <Badge tone="error">Hallucinated</Badge>
            </div>
            <p className="whitespace-pre-line text-sm leading-6 text-[var(--color-ink)]">
              {result.ungrounded.text}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]">
              <AlertTriangle className="h-3.5 w-3.5" />
              {result.ungrounded.model} · no document list, no product data,
              no instruction to decline — every specific fact above is a
              guess.
            </p>
          </div>

          <div className="z-10 mx-auto -my-3 flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-white px-4 py-1.5 shadow-sm">
            <ArrowDown className="h-3.5 w-3.5 text-[var(--color-navy)]" />
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-navy)]">
              Pega corrects it
            </p>
          </div>

          <div className="space-y-3 rounded-b-[20px] border border-t-0 border-[var(--color-success)]/30 bg-[#EDF9F4] p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[var(--color-success)]" />
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Step 2 — governed, deterministic execution
              </p>
              <Badge tone={result.governed.answered ? "success" : "info"}>
                {result.governed.answered ? "From the industry pack" : "Correctly declined"}
              </Badge>
            </div>
            <p className="whitespace-pre-line text-sm leading-6 text-[var(--color-ink)]">
              {result.governed.text}
            </p>
            <p className="text-xs text-[var(--color-ink-muted)]">
              source: {result.governed.source} · rule-based, not a model —
              the identical question gets the identical answer every time.
            </p>
          </div>

          <p className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-4 py-3 text-sm leading-6 text-[var(--color-ink-subtle)]">
            <span className="font-semibold text-[var(--color-ink)]">
              What Pega corrects:{" "}
            </span>
            {result.correction}
          </p>
        </div>
      ) : null}
    </Card>
  );
}
