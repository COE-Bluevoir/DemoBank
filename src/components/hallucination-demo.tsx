"use client";

import { useState } from "react";
import { AlertTriangle, ShieldCheck, ShieldOff } from "lucide-react";

import { HALLUCINATION_QUESTIONS } from "@/lib/agents/hallucination-demo";
import type { IndustryId } from "@/lib/industry/types";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";

interface Result {
  question: string;
  ungrounded: { text: string; model: string };
  governed: { text: string; source: string; answered: boolean };
}

/**
 * Grounded versus ungrounded, live.
 *
 * Both questions reproduce a real failure caught in this app's own chat
 * widget earlier: asked with no document list or product data to ground it,
 * the same model that answers correctly elsewhere invents US business-
 * banking requirements for an Indian bank, and a specific interest rate for
 * a product that has none on file. The point isn't that the model is bad —
 * it's that "ask an LLM" and "governed, deterministic execution" are
 * different architectures, and the difference shows up as fact, not opinion.
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
        eyebrow="Same question, two architectures"
        title="What happens without governance"
        description="Ask an ungrounded model and a deterministic, rule-based one the identical question. Both run live — nothing here is scripted text."
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
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3 rounded-[20px] border border-[var(--color-error)]/30 bg-[#FEF4F3] p-5">
            <div className="flex items-center gap-2">
              <ShieldOff className="h-4 w-4 text-[var(--color-error)]" />
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Ungrounded agent
              </p>
              <Badge tone="error">Invented</Badge>
            </div>
            <p className="text-sm leading-6 text-[var(--color-ink)]">
              {result.ungrounded.text}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]">
              <AlertTriangle className="h-3.5 w-3.5" />
              {result.ungrounded.model} · no document list, no product data,
              no instruction to decline — every specific fact above is a
              guess.
            </p>
          </div>

          <div className="space-y-3 rounded-[20px] border border-[var(--color-success)]/30 bg-[#EDF9F4] p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[var(--color-success)]" />
              <p className="text-sm font-semibold text-[var(--color-ink)]">
                Governed, deterministic
              </p>
              <Badge tone={result.governed.answered ? "success" : "info"}>
                {result.governed.answered ? "From the industry pack" : "Correctly declined"}
              </Badge>
            </div>
            <p className="text-sm leading-6 text-[var(--color-ink)]">
              {result.governed.text}
            </p>
            <p className="text-xs text-[var(--color-ink-muted)]">
              source: {result.governed.source} · rule-based, not a model —
              the identical question gets the identical answer every time.
            </p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
