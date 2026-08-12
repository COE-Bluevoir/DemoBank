import { getServerConfig } from "@/lib/config/env";
import {
  type AssistantProvider,
  type AssistantReply,
  type AssistantRequest,
  AssistantUnavailableError,
} from "@/lib/assistant/provider";

/**
 * Pega as the conversational backend.
 *
 * Pega's conversational channel is not exposed on the demo environment yet, so
 * this cannot be exercised end to end. It is written now, rather than left as
 * a note, because the shape of the call is what the Pega team has to satisfy —
 * and a seam nobody has tried to build against is usually the wrong shape.
 *
 * It fails loudly when unconfigured. A conversational backend that silently
 * fell through to a different system would make the demo claim Pega answered
 * when it did not, which is the one thing this comparison cannot afford.
 */
export class PegaAssistantProvider implements AssistantProvider {
  readonly name = "pega";

  async respond(request: AssistantRequest): Promise<AssistantReply> {
    const endpoint = getServerConfig().pegaAssistantUrl;

    if (!endpoint) {
      throw new AssistantUnavailableError(
        "PEGA_ASSISTANT_URL is not configured, so Pega cannot answer.",
        "The assistant is not available in this environment right now.",
      );
    }

    const pega = getServerConfig().pega;

    if (!pega) {
      throw new AssistantUnavailableError(
        "Pega connection is not configured.",
        "The assistant is not available in this environment right now.",
      );
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // The same correlation vocabulary the tool contract uses, so a
        // conversation can be tied to the case it was about.
        caseId: request.caseId,
        industryCode: request.industryId.toUpperCase(),
        message: request.message,
        history: request.history,
        schemaVersion: "1.0",
      }),
    });

    if (!response.ok) {
      throw new AssistantUnavailableError(
        `Pega assistant returned HTTP ${response.status}.`,
      );
    }

    const payload = (await response.json()) as {
      message?: string;
      suggestions?: Array<{ label: string; href: string }>;
      confidence?: number;
    };

    if (typeof payload.message !== "string" || payload.message.length === 0) {
      throw new AssistantUnavailableError(
        "Pega assistant returned no message.",
      );
    }

    return {
      message: payload.message,
      suggestions: payload.suggestions,
      confidence: payload.confidence,
      source: "pega",
    };
  }
}
