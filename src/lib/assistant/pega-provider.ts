import { getServerConfig } from "@/lib/config/env";
import {
  type AssistantProvider,
  type AssistantReply,
  type AssistantRequest,
  AssistantUnavailableError,
} from "@/lib/assistant/provider";
import { getTokenProvider } from "@/lib/pega/token-provider";

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

    // Same client-credentials token the case-management client uses — this
    // is one Pega application, not two, and the token endpoint doesn't care
    // which rule is being called.
    const accessToken = await getTokenProvider(pega).getAccessToken();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        // The chat_onboarding REST rule (Request > Headers, confirmed in
        // Dev Studio) maps these six values off the HTTP headers onto the
        // clipboard, not off the JSON body — a request that only carries
        // them in the body leaves .ChatMessage (and friends) untouched.
        // CRLF stripped because this is free customer text landing
        // directly in a header value.
        caseid: request.caseId ?? "",
        industrycode: request.industryId.toUpperCase(),
        message: request.message.replace(/[\r\n]+/g, " "),
        schemaversion: "1.0",
        conversationid: request.conversationId ?? "",
        sessionid: request.sessionId,
      },
      body: JSON.stringify({
        // The same correlation vocabulary the tool contract uses, so a
        // conversation can be tied to the case it was about.
        caseId: request.caseId,
        industryCode: request.industryId.toUpperCase(),
        message: request.message,
        history: request.history,
        // Pega's agent keeps its own conversation memory server-side rather
        // than replaying history; this is what resumes it. Empty string on
        // the first turn, exactly as the agent's session API expects.
        conversationId: request.conversationId ?? "",
        // Stable session anchor, present from the very first call — unlike
        // conversationId, which the agent only issues after replying once.
        // The agent needs a non-empty context identifier even before any
        // case exists, and this is the only thing in the request that is
        // both non-empty and unique to this browser session from turn one.
        sessionId: request.sessionId,
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
      conversationId?: string;
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
      // Absent (rather than falling back to the request's) when Pega does
      // not return one, e.g. on a turn where the agent's tool declines to
      // start a new session — carrying forward a stale ID would resume the
      // wrong conversation on the next turn.
      conversationId: payload.conversationId || undefined,
      source: "pega",
    };
  }
}
