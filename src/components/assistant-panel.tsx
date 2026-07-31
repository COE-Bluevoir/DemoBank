"use client";

import { MessageSquareMore } from "lucide-react";

import type { AssistantMessage } from "@/lib/onboarding/types";
import { formatDateTime } from "@/lib/onboarding/utils";
import { Badge, Button, Card } from "@/components/ui";

function toneForStatus(status: "info" | "success" | "warning" | "error") {
  if (status === "success") {
    return "success";
  }
  if (status === "warning") {
    return "warning";
  }
  if (status === "error") {
    return "error";
  }
  return "info";
}

export function AssistantMessageView({
  message,
  onAction,
  busy,
}: {
  message: AssistantMessage;
  onAction?: (actionId: string) => void;
  busy?: boolean;
}) {
  if (message.type === "status") {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-soft)] p-4">
        <div className="flex items-center justify-between gap-3">
          <Badge tone={toneForStatus(message.status)}>{message.status}</Badge>
          <span className="text-xs text-[var(--color-ink-muted)]">
            {formatDateTime(message.createdAt)}
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--color-ink)]">
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div
      className={
        message.role === "assistant"
          ? "rounded-[24px] rounded-tl-md bg-[var(--color-surface-soft)] p-4"
          : "ml-auto max-w-[90%] rounded-[24px] rounded-br-md bg-[var(--color-primary)] p-4 text-white"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-6">{message.content}</p>
        <span
          className={
            message.role === "assistant"
              ? "text-xs text-[var(--color-ink-muted)]"
              : "text-xs text-white/70"
          }
        >
          {formatDateTime(message.createdAt)}
        </span>
      </div>
      {message.type === "choice" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {message.choices.map((choice) => (
            <Button
              key={choice.id}
              variant="secondary"
              className="border-white/0 bg-white text-[var(--color-ink)]"
              disabled={busy}
              onClick={() => onAction?.(choice.actionId)}
              type="button"
            >
              {choice.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AssistantPanel({
  messages,
  busy,
  onAction,
}: {
  messages: AssistantMessage[];
  busy?: boolean;
  onAction?: (actionId: string) => void;
}) {
  return (
    <Card className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-primary)]/12 text-[var(--color-primary)]">
          <MessageSquareMore className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            Application guide
          </p>
          <p className="text-sm text-[var(--color-ink-subtle)]">
            Helpful guidance and status updates throughout your application.
          </p>
        </div>
      </div>
      <div className="space-y-3" aria-live="polite">
        {messages.map((message) => (
          <AssistantMessageView
            key={message.id}
            message={message}
            onAction={onAction}
            busy={busy}
          />
        ))}
      </div>
    </Card>
  );
}
