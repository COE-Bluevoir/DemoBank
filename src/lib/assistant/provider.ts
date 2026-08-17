import type { IndustryId } from "@/lib/industry/types";

/**
 * The conversational assistant, behind one seam.
 *
 * The customer-facing chat must not know which system is answering. Today that
 * is this application's own agent layer; the intention is for Pega to answer
 * once its conversational channel is exposed. Both satisfy this interface, so
 * plugging Pega in is a configuration change rather than a rewrite of the UI.
 *
 * What a provider may not do is act. Answering a question and changing a case
 * are different authorities, and a chat box that can quietly advance an
 * application is a governance hole rather than a feature — so the contract
 * returns words, plus a *suggestion* the customer must choose to follow.
 */

export interface AssistantTurn {
  role: "customer" | "assistant";
  content: string;
}

export interface AssistantRequest {
  message: string;
  industryId: IndustryId;
  /** Present once an application exists, so answers can be case-aware. */
  caseId?: string;
  /** Prior turns, oldest first. Bounded by the caller. */
  history: readonly AssistantTurn[];
  /**
   * Opaque session handle a provider issued on a prior turn.
   *
   * Providers that keep their own conversation memory server-side (Pega's
   * agent does) use this instead of `history` to resume it; providers that
   * don't may ignore it. Absent on the first turn.
   */
  conversationId?: string;
  /**
   * Stable identifier for this chat session, minted by the caller before the
   * first message is ever sent.
   *
   * Distinct from `conversationId`: this is known immediately (the browser
   * generates it, no round trip needed) and never changes for the life of
   * the widget, whereas `conversationId` is issued by the provider and is
   * absent until the first reply. A provider that needs a non-empty, unique
   * anchor before any case or conversation exists — Pega's agent does, to
   * ground its own session context — uses this instead.
   */
  sessionId: string;
}

/**
 * Something the customer can do next.
 *
 * Rendered as a button the customer presses. It is never followed
 * automatically: the assistant proposes, the customer decides.
 */
export interface AssistantSuggestion {
  label: string;
  href: string;
}

export interface AssistantReply {
  message: string;
  suggestions?: readonly AssistantSuggestion[];
  /** Which system answered. Shown in the console, not to the customer. */
  source: string;
  /** Absent when the provider does not report confidence. */
  confidence?: number;
  /**
   * Session handle to echo back on the next turn, when the provider issued
   * one. The caller stores this opaquely — it is never inspected or parsed,
   * only carried.
   */
  conversationId?: string;
}

export interface AssistantProvider {
  readonly name: string;
  respond(request: AssistantRequest): Promise<AssistantReply>;
}

/** Raised when a provider cannot answer. Carries customer-safe wording. */
export class AssistantUnavailableError extends Error {
  readonly customerMessage: string;

  constructor(technicalDetail: string, customerMessage?: string) {
    super(technicalDetail);
    this.name = "AssistantUnavailableError";
    this.customerMessage =
      customerMessage ??
      "I cannot answer that right now. Please try again in a moment, or continue with your application.";
  }
}
