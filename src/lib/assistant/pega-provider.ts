import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getServerConfig } from "@/lib/config/env";
import {
  type AssistantProvider,
  type AssistantReply,
  type AssistantRequest,
  AssistantUnavailableError,
} from "@/lib/assistant/provider";
import { PegaIntegrationError } from "@/lib/pega/errors";
import { getTokenProvider } from "@/lib/pega/token-provider";

/**
 * Conversational assistant backed by a Pega Agentic Agent Rule.
 *
 * Two wire formats are supported:
 *  1. A2A (Agent2Agent) — when PEGA_ASSISTANT_URL points at an agent-card.json
 *     (or any agent2agent URL). This is the live Pega Infinity agent-rule path.
 *  2. Legacy simple POST — { message, caseId?, industryId? } → { message, … }
 *     kept so older demos keep working.
 *
 * Both attach the OAuth client-credentials token. Posting the card URL with
 * no Authorization header is what produced HTTP 401.
 */

const legacyResponseSchema = z.object({
  reply: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  suggestions: z
    .array(
      z.union([
        z.string(),
        z.object({
          label: z.string(),
          href: z.string().optional(),
        }),
      ]),
    )
    .optional(),
  confidence: z.number().min(0).max(1).optional(),
  conversationId: z.string().min(1).optional(),
});

const agentCardSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    url: z.string().url().optional(),
    preferredTransport: z.string().optional(),
    additionalInterfaces: z
      .array(
        z.object({
          url: z.string().url().optional(),
          transport: z.string().optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

interface ResolvedAgentEndpoint {
  rpcUrl: string;
  agentName?: string;
}

function isA2AAssistantUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("agent-card.json") ||
    lower.includes("agent2agent") ||
    lower.includes("/.well-known/")
  );
}

/**
 * Derive the JSON-RPC endpoint from a card URL or a bare agent base URL.
 * Pega cards live at:
 *   …/ai-agents/<AGENT_ID>/.well-known/agent-card.json
 * and the RPC endpoint is typically the agent base (parent of .well-known).
 */
function rpcUrlFromCardOrAgentUrl(url: string): string {
  try {
    const parsed = new URL(url);
    let path = parsed.pathname;

    if (path.endsWith("/.well-known/agent-card.json")) {
      path = path.slice(0, -"/.well-known/agent-card.json".length);
    } else if (path.endsWith("/agent-card.json")) {
      path = path.slice(0, -"/agent-card.json".length);
      if (path.endsWith("/.well-known")) {
        path = path.slice(0, -"/.well-known".length);
      }
    }

    if (path.endsWith("/")) {
      path = path.slice(0, -1);
    }

    parsed.pathname = path;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url
      .replace(/\/\.well-known\/agent-card\.json\/?$/i, "")
      .replace(/\/$/, "");
  }
}

function extractTextFromA2APayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const root = payload as Record<string, unknown>;
  const result =
    root.result && typeof root.result === "object"
      ? (root.result as Record<string, unknown>)
      : root;

  const direct = textFromParts(result.parts);
  if (direct) {
    return direct;
  }

  const status = result.status;
  if (status && typeof status === "object") {
    const statusMessage = (status as Record<string, unknown>).message;
    if (statusMessage && typeof statusMessage === "object") {
      const fromStatus = textFromParts(
        (statusMessage as Record<string, unknown>).parts,
      );
      if (fromStatus) {
        return fromStatus;
      }
    }
  }

  const history = result.history;
  if (Array.isArray(history)) {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const entry = history[index];
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const role = (entry as Record<string, unknown>).role;
      if (role === "agent" || role === "assistant" || role === undefined) {
        const fromHistory = textFromParts(
          (entry as Record<string, unknown>).parts,
        );
        if (fromHistory) {
          return fromHistory;
        }
      }
    }
  }

  const artifacts = result.artifacts;
  if (Array.isArray(artifacts)) {
    for (let index = artifacts.length - 1; index >= 0; index -= 1) {
      const artifact = artifacts[index];
      if (!artifact || typeof artifact !== "object") {
        continue;
      }
      const fromArtifact = textFromParts(
        (artifact as Record<string, unknown>).parts,
      );
      if (fromArtifact) {
        return fromArtifact;
      }
    }
  }

  for (const key of ["reply", "message", "text", "content", "output"] as const) {
    const value = result[key] ?? root[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function conversationIdFromA2APayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const root = payload as Record<string, unknown>;
  const result =
    root.result && typeof root.result === "object"
      ? (root.result as Record<string, unknown>)
      : root;

  for (const key of ["contextId", "conversationId"] as const) {
    const value = result[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function textFromParts(parts: unknown): string | undefined {
  if (!Array.isArray(parts)) {
    return undefined;
  }

  const chunks: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") {
      continue;
    }
    const record = part as Record<string, unknown>;
    const kind = record.kind ?? record.type;
    if (
      (kind === "text" || kind === "TextPart" || kind === undefined) &&
      typeof record.text === "string" &&
      record.text.trim()
    ) {
      chunks.push(record.text.trim());
    }
  }

  if (chunks.length === 0) {
    return undefined;
  }
  return chunks.join("\n\n");
}

function jsonRpcError(
  payload: unknown,
): { code?: number; message: string } | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const error = (payload as Record<string, unknown>).error;
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const record = error as Record<string, unknown>;
  const message = record.message;
  if (typeof message !== "string" || !message.trim()) {
    return undefined;
  }
  const code =
    typeof record.code === "number"
      ? record.code
      : typeof record.code === "string"
        ? Number(record.code)
        : undefined;
  return {
    code: Number.isFinite(code) ? code : undefined,
    message: message.trim(),
  };
}

function isRetryableAgentFailure(status: number, rpcCode?: number): boolean {
  return status === 401 || status >= 500 || rpcCode === -32603;
}

export class PegaAssistantProvider implements AssistantProvider {
  readonly name = "pega-agent";

  private resolvedEndpoint?: ResolvedAgentEndpoint;
  private resolveInFlight?: Promise<ResolvedAgentEndpoint>;

  async respond(request: AssistantRequest): Promise<AssistantReply> {
    const config = getServerConfig();
    const assistantUrl = config.pegaAssistantUrl;

    if (!assistantUrl) {
      throw new AssistantUnavailableError(
        "PEGA_ASSISTANT_URL is not configured, so Pega cannot answer.",
        "The assistant is not available in this environment right now.",
      );
    }

    if (!config.pega) {
      throw new AssistantUnavailableError(
        "Pega connection is not configured.",
        "The assistant is not available in this environment right now.",
      );
    }

    let token: string;
    try {
      token = await getTokenProvider(config.pega).getAccessToken();
    } catch (error) {
      if (error instanceof PegaIntegrationError) {
        throw new AssistantUnavailableError(
          error.technicalDetail ?? error.message,
          "The assistant is not available in this environment right now.",
        );
      }
      throw error;
    }

    // Agent rules often need longer than DX case calls.
    const timeoutMs = Math.max(config.pega.timeoutMs, 20_000);

    if (isA2AAssistantUrl(assistantUrl)) {
      return this.respondViaA2A({
        cardOrAgentUrl: assistantUrl,
        token,
        timeoutMs,
        request,
      });
    }

    return this.respondViaLegacy({
      url: assistantUrl,
      token,
      timeoutMs,
      request,
    });
  }

  private async resolveA2AEndpoint(
    cardOrAgentUrl: string,
    token: string,
    timeoutMs: number,
  ): Promise<ResolvedAgentEndpoint> {
    if (this.resolvedEndpoint) {
      return this.resolvedEndpoint;
    }

    if (this.resolveInFlight) {
      return this.resolveInFlight;
    }

    this.resolveInFlight = (async () => {
      const fallbackRpc = rpcUrlFromCardOrAgentUrl(cardOrAgentUrl);
      const cardUrl = cardOrAgentUrl.includes("agent-card.json")
        ? cardOrAgentUrl
        : `${fallbackRpc}/.well-known/agent-card.json`;

      try {
        const response = await fetch(cardUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        });

        if (response.ok) {
          const raw: unknown = await response.json();
          const card = agentCardSchema.safeParse(raw);
          if (card.success) {
            const fromCard =
              card.data.url ??
              card.data.additionalInterfaces?.find((item) => item.url)?.url;
            const rpcUrl = fromCard
              ? rpcUrlFromCardOrAgentUrl(fromCard)
              : fallbackRpc;
            const resolved: ResolvedAgentEndpoint = {
              rpcUrl,
              agentName: card.data.name,
            };
            this.resolvedEndpoint = resolved;
            return resolved;
          }
        }
      } catch {
        // Fall through — many Pega hosts still accept message/send on the
        // agent base even when the card is gated.
      }

      const resolved: ResolvedAgentEndpoint = { rpcUrl: fallbackRpc };
      this.resolvedEndpoint = resolved;
      return resolved;
    })();

    try {
      return await this.resolveInFlight;
    } finally {
      this.resolveInFlight = undefined;
    }
  }

  private async respondViaA2A(args: {
    cardOrAgentUrl: string;
    token: string;
    timeoutMs: number;
    request: AssistantRequest;
  }): Promise<AssistantReply> {
    const config = getServerConfig();
    const tokenProvider = config.pega
      ? getTokenProvider(config.pega)
      : undefined;
    let token = args.token;

    const endpoint = await this.resolveA2AEndpoint(
      args.cardOrAgentUrl,
      token,
      args.timeoutMs,
    );

    const contextId =
      args.request.conversationId?.trim() ||
      args.request.caseId?.trim() ||
      `onb-${args.request.industryId}-session`;

    const history = args.request.history ?? [];
    const recent = history.slice(-6);
    const historyBlock =
      recent.length === 0
        ? ""
        : `Prior conversation:\n${recent
            .map(
              (turn) =>
                `${turn.role === "assistant" ? "Assistant" : "Customer"}: ${turn.content}`,
            )
            .join("\n")}\n\nCurrent question:\n`;
    const userText = `${historyBlock}${args.request.message}`;

    const maxAttempts = 2;
    let lastError: AssistantUnavailableError | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const body = {
        jsonrpc: "2.0",
        id: randomUUID(),
        method: "message/send",
        params: {
          message: {
            kind: "message",
            role: "user",
            messageId: randomUUID(),
            contextId,
            parts: [
              {
                kind: "text",
                text: userText,
              },
            ],
            metadata: {
              industryId: args.request.industryId,
              caseId: args.request.caseId,
              source: "northstar-bank-onboarding",
            },
          },
          configuration: {
            blocking: true,
            acceptedOutputModes: ["text/plain"],
          },
        },
      };

      let response: Response;
      try {
        response = await fetch(endpoint.rpcUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(args.timeoutMs),
          cache: "no-store",
        });
      } catch (error) {
        lastError = new AssistantUnavailableError(
          error instanceof Error
            ? `Pega agent did not respond: ${error.message}`
            : "Pega agent did not respond.",
        );
        if (attempt < maxAttempts) {
          continue;
        }
        throw lastError;
      }

      if (response.status === 401 && attempt < maxAttempts && tokenProvider) {
        tokenProvider.invalidate();
        token = await tokenProvider.getAccessToken();
        continue;
      }

      const rawText = await response.text();
      let payload: unknown;
      try {
        payload = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new AssistantUnavailableError(
          `Pega agent returned a non-JSON body (HTTP ${response.status}).`,
        );
      }

      const rpc = jsonRpcError(payload);
      if (!response.ok || rpc) {
        lastError = new AssistantUnavailableError(
          rpc
            ? `Pega agent error (HTTP ${response.status}): ${rpc.message}`
            : `Pega agent request failed (HTTP ${response.status}).`,
        );
        if (
          attempt < maxAttempts &&
          isRetryableAgentFailure(response.status, rpc?.code)
        ) {
          continue;
        }
        throw lastError;
      }

      const message = extractTextFromA2APayload(payload);
      if (!message) {
        throw new AssistantUnavailableError(
          "Pega agent returned an unexpected payload shape.",
        );
      }

      return {
        message,
        suggestions: undefined,
        confidence: 0.9,
        conversationId: conversationIdFromA2APayload(payload) ?? contextId,
        source: endpoint.agentName
          ? `${this.name}:${endpoint.agentName}`
          : this.name,
      };
    }

    throw (
      lastError ??
      new AssistantUnavailableError("Pega agent did not respond.")
    );
  }

  private async respondViaLegacy(args: {
    url: string;
    token: string;
    timeoutMs: number;
    request: AssistantRequest;
  }): Promise<AssistantReply> {
    let response: Response;

    try {
      response = await fetch(args.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${args.token}`,
        },
        body: JSON.stringify({
          message: args.request.message,
          caseId: args.request.caseId,
          industryId: args.request.industryId,
          history: args.request.history,
          conversationId: args.request.conversationId ?? "",
          schemaVersion: "1.0",
        }),
        signal: AbortSignal.timeout(args.timeoutMs),
      });
    } catch (error) {
      throw new AssistantUnavailableError(
        error instanceof Error
          ? `Pega assistant did not respond: ${error.message}`
          : "Pega assistant did not respond.",
      );
    }

    if (!response.ok) {
      throw new AssistantUnavailableError(
        `Pega assistant returned HTTP ${response.status}.`,
      );
    }

    const payload = legacyResponseSchema.safeParse(await response.json());

    if (!payload.success) {
      throw new AssistantUnavailableError(
        "Pega assistant returned an unexpected payload.",
      );
    }

    const message = payload.data.message ?? payload.data.reply;
    if (!message) {
      throw new AssistantUnavailableError(
        "Pega assistant returned no message.",
      );
    }

    const suggestions = payload.data.suggestions
      ?.map((item) => {
        if (typeof item === "string") {
          return { label: item, href: "#" };
        }
        return { label: item.label, href: item.href ?? "#" };
      })
      .filter((item) => item.label.trim().length > 0);

    return {
      message,
      suggestions,
      confidence: payload.data.confidence,
      conversationId: payload.data.conversationId,
      source: this.name,
    };
  }
}
