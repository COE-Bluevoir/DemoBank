import { z } from "zod";

import { getIndustryPack } from "@/lib/industry/registry";
import { getServerConfig } from "@/lib/config/env";
import {
  type AssistantProvider,
  type AssistantReply,
  type AssistantRequest,
  AssistantUnavailableError,
} from "@/lib/assistant/provider";

/**
 * Conversational assistant backed by OpenAI.
 *
 * Handles the "I don't know exactly what I want yet" customer — free-text,
 * open-ended, genuinely understood rather than pattern-matched. It keeps the
 * same authority limits as every other provider: the model only ever chooses
 * whether to offer the one hard-coded "start the application" suggestion, it
 * never invents a href or a fact about rates, eligibility or case state. Those
 * stay server-controlled so a fluent answer can never smuggle in an action or
 * a claim nobody checked.
 */

const structuredReplySchema = z.object({
  message: z.string().min(1),
  offerStart: z.boolean().optional().default(false),
});

function requiredDocumentsList(pack: ReturnType<typeof getIndustryPack>): string {
  const required = pack.documentProfile.filter((item) => item.mandatory);
  const optional = pack.documentProfile.filter((item) => !item.mandatory);

  const lines = required.map(
    (item) => `- ${item.label} (required) — ${item.description}`,
  );

  if (optional.length > 0) {
    lines.push(
      ...optional.map(
        (item) => `- ${item.label} (optional) — ${item.description}`,
      ),
    );
  }

  return lines.join("\n");
}

function systemPrompt(pack: ReturnType<typeof getIndustryPack>): string {
  return [
    `You are the onboarding guide on ${pack.brand.organisationName}'s website.`,
    `You help a visitor who may not yet know what they want figure out whether ` +
      `${article(pack.brand.productName)} ${pack.brand.productName} fits their need, ` +
      `then guide them toward starting an application.`,
    `${pack.objective}`,
    `The documents this application actually asks for — the only ones you may ` +
      `ever name — are:\n${requiredDocumentsList(pack)}`,
    `Ground every answer only in what you have been told here. Never invent a ` +
      `document, a specific interest rate, fee, approval odds or eligibility ` +
      `decision — you do not have access to that data and a wrong answer would ` +
      `be acted on. If asked about terms, say a specialist confirms exact terms ` +
      `during the application. This is an Indian business-banking journey — do ` +
      `not reach for US or generic-Western concepts (a Social Security number, ` +
      `a US driver's license, an EIN) that do not apply here.`,
    `Do not discuss mortgages, home loans, personal loans, credit cards, ` +
      `investments, pensions or anything this organisation does not sell here.`,
    `Keep replies conversational and brief — one to three sentences, whatever ` +
      `actually fits the question. Write like a helpful person typing a real ` +
      `reply, not a form letter: vary your sentence structure and openers ` +
      `turn to turn, don't reuse the same phrasing you used earlier in this ` +
      `conversation, and don't force in a recap of everything you know about ` +
      `the product if the question only asked about one part of it.`,
    `Reply with a JSON object only, matching exactly: ` +
      `{"message": string, "offerStart": boolean}. ` +
      `Set "offerStart" to true only when the visitor is ready to begin the ` +
      `application (they've expressed clear intent to proceed), otherwise false.`,
  ].join("\n\n");
}

function article(noun: string): string {
  return /^[aeiou]/i.test(noun.trim()) ? "an" : "a";
}

interface ChatCompletionChoice {
  message?: { content?: string | null };
}

const chatCompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z
          .object({ content: z.string().nullable().optional() })
          .optional(),
      }),
    )
    .min(1),
});

export class OpenAIAssistantProvider implements AssistantProvider {
  readonly name = "openai";

  async respond(request: AssistantRequest): Promise<AssistantReply> {
    const config = getServerConfig();

    if (!config.openaiApiKey) {
      throw new AssistantUnavailableError(
        "OPENAI_API_KEY is not configured.",
        "The assistant is not available in this environment right now.",
      );
    }

    const pack = getIndustryPack(request.industryId);

    const history = (request.history ?? []).slice(-8).map((turn) => ({
      role: turn.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: turn.content,
    }));

    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: config.openaiModel,
          response_format: { type: "json_object" },
          // Higher than a routing/classification call would use — this is a
          // customer-facing conversational reply, and a low temperature made
          // every answer to a similar question come back nearly word-for-word
          // identical, which read as scripted rather than genuinely reasoned.
          // The grounding rules above constrain facts, not phrasing, so this
          // only affects word choice and structure, never what's asserted.
          temperature: 0.9,
          // Discourage falling back on the same stock phrases turn to turn.
          frequency_penalty: 0.4,
          presence_penalty: 0.2,
          messages: [
            { role: "system", content: systemPrompt(pack) },
            ...history,
            { role: "user", content: request.message },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
    } catch (error) {
      throw new AssistantUnavailableError(
        error instanceof Error
          ? `OpenAI did not respond: ${error.message}`
          : "OpenAI did not respond.",
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AssistantUnavailableError(
        `OpenAI returned HTTP ${response.status}. ${detail.slice(0, 200)}`,
      );
    }

    const raw: unknown = await response.json();
    const parsed = chatCompletionSchema.safeParse(raw);
    const content = parsed.success
      ? (parsed.data.choices[0] as ChatCompletionChoice).message?.content
      : undefined;

    if (!content) {
      throw new AssistantUnavailableError("OpenAI returned an empty reply.");
    }

    let structured: z.infer<typeof structuredReplySchema>;
    try {
      structured = structuredReplySchema.parse(JSON.parse(content));
    } catch {
      // The model didn't hold the JSON contract — still show the words rather
      // than fail the turn, just without a suggestion attached.
      structured = { message: content.trim(), offerStart: false };
    }

    return {
      message: structured.message,
      suggestions: structured.offerStart
        ? [
            {
              label: `Start an application`,
              href: `/onboarding/start?industry=${pack.id}`,
            },
          ]
        : undefined,
      source: this.name,
    };
  }
}
