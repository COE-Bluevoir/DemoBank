import { randomUUID } from "node:crypto";

import { isIndustryId } from "@/lib/industry/registry";
import { getAssistantProvider } from "@/lib/assistant/registry";
import { AssistantUnavailableError } from "@/lib/assistant/provider";
import type { AssistantTurn } from "@/lib/assistant/provider";

/**
 * A2A (Agent2Agent) server for this app's assistant.
 *
 * Runs the OpenAI-backed assistant behind a standard `message/send` RPC, so a
 * Pega "Connect Agent" rule can call it the same way `lib/assistant/pega-
 * provider.ts` already calls Pega's own A2A agent (this is the mirror image
 * of that client). Useful in its own right: Pega's live conversational agent
 * has been unreliable all session (see docs/pega-chat-trace-findings*.md) —
 * this gives a Pega flow a working fallback to delegate a customer turn to,
 * grounded the same way the website's own chat widget already is.
 *
 * Conversation memory lives here, keyed by `contextId`, in-memory — same
 * single-instance-demo tradeoff as `lib/services/idempotency.ts`.
 */

const MAX_HISTORY_TURNS = 8;
const conversations = new Map<string, AssistantTurn[]>();

export interface A2AMessagePart {
  kind?: string;
  text?: string;
}

export interface A2ASendParams {
  message?: {
    messageId?: string;
    contextId?: string;
    parts?: A2AMessagePart[];
    metadata?: { industryId?: string; caseId?: string };
  };
}

function textFromParts(parts: A2AMessagePart[] | undefined): string {
  return (parts ?? [])
    .filter((part) => (part.kind ?? "text") === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n\n")
    .trim();
}

export interface A2AResult {
  status: number;
  body: Record<string, unknown>;
}

/** Handle one `message/send` JSON-RPC call. */
export async function handleA2AMessageSend(
  id: string | number | null,
  params: A2ASendParams | undefined,
): Promise<A2AResult> {
  const text = textFromParts(params?.message?.parts);

  if (!text) {
    return {
      status: 200,
      body: {
        jsonrpc: "2.0",
        id,
        error: { code: -32602, message: "message.parts must include non-empty text." },
      },
    };
  }

  const contextId = params?.message?.contextId || `a2a-${randomUUID()}`;
  const requestedIndustry = params?.message?.metadata?.industryId ?? "";
  const industryId = isIndustryId(requestedIndustry) ? requestedIndustry : "banking";
  const history = conversations.get(contextId) ?? [];

  try {
    const reply = await getAssistantProvider("openai").respond({
      message: text,
      industryId,
      caseId: params?.message?.metadata?.caseId,
      history,
      conversationId: contextId,
    });

    const updated = [
      ...history,
      { role: "customer" as const, content: text },
      { role: "assistant" as const, content: reply.message },
    ].slice(-MAX_HISTORY_TURNS);
    conversations.set(contextId, updated);

    return {
      status: 200,
      body: {
        jsonrpc: "2.0",
        id,
        result: {
          kind: "message",
          role: "agent",
          messageId: randomUUID(),
          contextId,
          parts: [{ kind: "text", text: reply.message }],
          metadata: {
            source: reply.source,
            suggestions: reply.suggestions ?? [],
          },
        },
      },
    };
  } catch (error) {
    const message =
      error instanceof AssistantUnavailableError
        ? error.customerMessage
        : "The assistant could not answer that right now.";

    return {
      status: 200,
      body: {
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message },
      },
    };
  }
}

/** Test seam: clear tracked conversation history. */
export function resetA2AConversations(): void {
  conversations.clear();
}
