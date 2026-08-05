import type { z } from "zod";

import type {
  AgentProvider,
  CompletionRequest,
  CompletionResult,
} from "@/lib/agents/provider";
import { AgentProviderError } from "@/lib/agents/provider";

/**
 * Deterministic provider.
 *
 * Classifies intent from keywords rather than a model. Two reasons it exists:
 * the journey must be demonstrable without AWS access, and tests need
 * repeatable output. It is deliberately simple — it is a fallback, not a
 * second implementation of the product.
 */

interface IntentRule {
  intent: string;
  delegateTo: string;
  pattern: RegExp;
  response: string;
}

/**
 * A question about doing something is not an instruction to do it.
 *
 * "What do I need to open an account?" contains the words that would
 * otherwise classify it as an intent to apply. Interrogative phrasing is
 * checked first so questions reach the policy specialist instead of starting
 * an application the customer never asked for.
 */
function isQuestion(message: string): boolean {
  return (
    message.trim().endsWith("?") ||
    /^\s*(what|which|how|why|when|where|who|do|does|did|can|could|is|are|am|will|would|should)\b/i.test(
      message,
    )
  );
}

/** Status enquiries are questions, but they are not policy questions. */
const STATUS_PATTERN =
  /\b(status|progress|how long|where.*(application|case)|any update)\b/i;

/** Ordered: the first match wins, so more specific intents come first. */
const RULES: readonly IntentRule[] = [
  {
    intent: "OPEN_ACCOUNT",
    delegateTo: "none",
    pattern: /\b(open|apply|start|sign up|new)\b.*\b(account|policy|service|application)\b/i,
    response:
      "I can start that application for you. I will ask for a few details and two supporting documents.",
  },
  {
    intent: "UPLOAD_DOCUMENT",
    delegateTo: "document",
    pattern: /\b(upload|attach|send|submit)\b.*\b(document|passport|licence|license|bill|statement|id)\b/i,
    response:
      "You can upload your documents on the next step. I will check them once they arrive.",
  },
  {
    intent: "CHECK_STATUS",
    delegateTo: "none",
    pattern: /\b(status|progress|how long|where.*(application|case)|update)\b/i,
    response: "Let me check where your application has reached.",
  },
  {
    intent: "PROVIDE_DETAILS",
    delegateTo: "none",
    pattern: /\b(my name is|i am|date of birth|dob|email|phone|mobile|address is)\b/i,
    response: "Thank you — I have noted those details.",
  },
  {
    intent: "ASK_POLICY",
    delegateTo: "policy",
    pattern: /\b(what|which|how|why|can i|do i|need|require|eligible|documents?|fee|charge|take)\b/i,
    response: "Let me answer that for you.",
  },
];

/** Simple, high-precision extraction. Anything ambiguous is left alone. */
function extractFields(message: string): Record<string, string> {
  const fields: Record<string, string> = {};

  const email = message.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (email) {
    fields.email = email[0];
  }

  const dob = message.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (dob) {
    fields.dateOfBirth = dob[1];
  }

  const name = message.match(/\bmy name is\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)/);
  if (name) {
    fields.firstName = name[1];
    fields.lastName = name[2];
  }

  return fields;
}

export class DeterministicAgentProvider implements AgentProvider {
  readonly name = "deterministic" as const;

  async complete<TSchema extends z.ZodType>(
    request: CompletionRequest<TSchema>,
  ): Promise<CompletionResult<z.infer<TSchema>>> {
    const candidate = this.buildCandidate(request);
    const parsed = request.schema.safeParse(candidate);

    if (!parsed.success) {
      throw new AgentProviderError(
        `Deterministic provider produced a value that does not satisfy ${request.promptTemplateId}.`,
      );
    }

    return { value: parsed.data, repaired: false };
  }

  private buildCandidate(
    request: CompletionRequest<z.ZodType>,
  ): Record<string, unknown> {
    if (request.promptTemplateId === "policy-answer") {
      // Without a knowledge base there is nothing to ground against, and
      // saying so is more honest than inventing a confident answer.
      return {
        answer:
          "I can help with that once connected to the approved product material. In the meantime, our team can confirm the details for you.",
        grounded: false,
        sources: [],
        confidence: 0.3,
      };
    }

    const message = request.user;
    const statusRule = RULES.find((rule) => rule.intent === "CHECK_STATUS");
    const policyRule = RULES.find((rule) => rule.intent === "ASK_POLICY");

    // A status enquiry outranks other question handling.
    if (STATUS_PATTERN.test(message) && statusRule) {
      return this.toCandidate(statusRule, message);
    }

    // Any other question is answered, not acted upon.
    if (isQuestion(message) && policyRule) {
      return this.toCandidate(policyRule, message);
    }

    const rule = RULES.find((candidate) => candidate.pattern.test(message));

    if (!rule) {
      return {
        intent: "OUT_OF_SCOPE",
        delegateTo: "none",
        customerResponse:
          "I can help with opening an account, supplying your details, uploading documents, or checking your application status.",
        extractedFields: {},
        confidence: 0.4,
      };
    }

    return this.toCandidate(rule, message);
  }

  private toCandidate(rule: IntentRule, message: string) {
    return {
      intent: rule.intent,
      delegateTo: rule.delegateTo,
      customerResponse: rule.response,
      extractedFields: extractFields(message),
      // Keyword matching is a weak signal and should not present as certainty.
      confidence: 0.55,
    };
  }
}
