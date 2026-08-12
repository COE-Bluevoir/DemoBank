"use client";

import Link from "next/link";
import { MessageCircle, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { IndustryId } from "@/lib/industry/types";
import { getIndustryPack } from "@/lib/industry/registry";

/**
 * The conversational assistant, as the customer meets it.
 *
 * Deliberately a docked panel rather than a step in the journey: it is there
 * to answer questions alongside the application, and closing it must never
 * cost the customer progress.
 *
 * It offers actions as links the customer chooses to follow. Nothing here
 * submits anything on their behalf — the assistant proposes, the customer
 * decides, and every state change still goes through the journey where the
 * workflow can see it.
 */

interface Message {
  role: "customer" | "assistant";
  content: string;
  suggestions?: Array<{ label: string; href: string }>;
}

export function AssistantChat({
  industryId = "banking",
  caseId,
}: {
  industryId?: IndustryId;
  caseId?: string;
}) {
  const pack = getIndustryPack(industryId);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Hello — I can help with your ${pack.brand.productName}. Ask me what documents you need, how long it takes, or how your information is protected.`,
    },
  ]);

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Keep the newest reply in view without yanking the whole page.
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, open]);

  async function send() {
    const message = draft.trim();

    if (!message || busy) {
      return;
    }

    setDraft("");
    setBusy(true);
    setMessages((current) => [...current, { role: "customer", content: message }]);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          industryId,
          caseId,
          // Recent turns only: enough for context, bounded by the endpoint.
          history: messages.slice(-8).map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      });

      const payload = await response.json();

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: payload.message,
          suggestions: payload.suggestions,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            "I could not reach the assistant just then. Please try again in a moment.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the assistant"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-[var(--color-navy)] px-5 py-4 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(16,42,67,0.28)] transition hover:brightness-110"
      >
        <MessageCircle className="h-5 w-5" />
        Ask {pack.brand.organisationName.split(" ")[0]}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex h-[560px] w-[min(92vw,400px)] flex-col overflow-hidden rounded-[26px] border border-[var(--color-border)] bg-white shadow-[0_24px_60px_rgba(16,42,67,0.24)]">
      <div
        className="flex items-center justify-between px-5 py-4 text-white"
        style={{ backgroundColor: pack.brand.accent }}
      >
        <div>
          <p className="text-sm font-semibold">{pack.brand.organisationName}</p>
          <p className="text-xs text-white/80">Onboarding assistant</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close the assistant"
          className="rounded-full p-1.5 transition hover:bg-white/15"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto bg-[var(--color-surface-soft)] p-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "customer" ? "flex justify-end" : "flex justify-start"
            }
          >
            <div
              className={[
                "max-w-[86%] whitespace-pre-line rounded-[18px] px-4 py-3 text-sm leading-6",
                message.role === "customer"
                  ? "bg-[var(--color-navy)] text-white"
                  : "bg-white text-[var(--color-ink)]",
              ].join(" ")}
            >
              {message.content}

              {message.suggestions && message.suggestions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.suggestions.map((suggestion) => (
                    <Link
                      key={suggestion.href}
                      href={suggestion.href}
                      className="rounded-full border border-[var(--color-border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink)] transition hover:border-[var(--color-ink)]"
                    >
                      {suggestion.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {busy ? (
          <div className="flex justify-start">
            <div className="rounded-[18px] bg-white px-4 py-3 text-sm text-[var(--color-ink-muted)]">
              Typing…
            </div>
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      <form
        className="flex items-center gap-2 border-t border-[var(--color-border)] bg-white p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask a question"
          aria-label="Message the assistant"
          className="min-w-0 flex-1 rounded-full border border-[var(--color-border)] px-4 py-2.5 text-sm outline-none focus:border-[var(--color-ink)]"
        />
        <button
          type="submit"
          disabled={busy || draft.trim().length === 0}
          aria-label="Send"
          className="rounded-full bg-[var(--color-navy)] p-2.5 text-white transition disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
