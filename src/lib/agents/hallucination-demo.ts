import { getServerConfig } from "@/lib/config/env";
import { OnboardingAssistantProvider } from "@/lib/assistant/onboarding-provider";
import type { IndustryId } from "@/lib/industry/types";

/**
 * Grounded versus ungrounded, side by side.
 *
 * A marketing-demoable answer to "why does governed execution matter" that
 * isn't a capability table — an actual model, actually asked, actually
 * getting it wrong. Both curated questions below are reproductions of a real
 * failure caught live in this app's own chat widget before its system prompt
 * carried the real document list (see the OpenAI provider's grounding fix):
 * asked with no grounding, gpt-4o-mini confidently invents US business-
 * banking requirements (an EIN, "Articles of Incorporation") for an Indian
 * bank, and a specific fabricated interest rate for a product that has none
 * on file. Deliberately not free text — a live demo needs a failure that
 * reproduces the same way every time, not one that depends on today's
 * sampling.
 */

export interface HallucinationQuestion {
  id: string;
  label: string;
  question: string;
  /**
   * Curated, not model-generated — names the specific invented claim so the
   * demo can point at it instead of asking the audience to spot it
   * themselves, and states how the governed side gets it right on purpose.
   */
  correction: string;
}

export const HALLUCINATION_QUESTIONS: readonly HallucinationQuestion[] = [
  {
    id: "documents",
    label: "What documents do I need?",
    question: "What documents do I need to open a business account?",
    correction:
      "The ungrounded model reaches for US concepts — an EIN, a Social Security Number, \"Articles of Incorporation\" — that don't exist in Indian business banking. Pega's answer is pulled from the same document checklist the case actually enforces at upload: nothing it names can be wrong, because it isn't guessing.",
  },
  {
    id: "interest-rate",
    label: "What's the interest rate?",
    question: "What is the interest rate on the Everyday Plus Account?",
    correction:
      "The ungrounded model states a specific interest rate with total confidence — the product has none on file, so every digit is fabricated. Pega's answer is scoped to what the case data actually contains, and says so instead of inventing a number.",
  },
];

export interface HallucinationDemoResult {
  question: string;
  correction: string;
  ungrounded: {
    text: string;
    model: string;
    grounded: false;
  };
  governed: {
    text: string;
    source: string;
    /** True when the answer came from the industry pack; false when it correctly declined instead of guessing. */
    answered: boolean;
  };
}

/**
 * Strips markdown syntax the model tends to reach for (bold, headers,
 * list markers) without touching wording — the fabrication itself is the
 * point of this demo, so the system prompt stays exactly what reliably
 * reproduced it; asking the model to also avoid markdown made it hedge
 * instead of committing to a specific (invented) answer.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .trim();
}

/**
 * The ungrounded side: no document list, no product data, no instruction to
 * decline — this is deliberately what a naive integration looks like, not a
 * strawman. Every fact it states past this point, it is inventing.
 */
async function askUngrounded(question: string): Promise<{ text: string; model: string }> {
  const config = getServerConfig();

  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: config.openaiModel,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful onboarding assistant for NorthStar Bank. Answer the customer confidently and directly.",
        },
        { role: "user", content: question },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`OpenAI returned HTTP ${response.status}.`);
  }

  const raw = (await response.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = raw.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error("OpenAI returned an empty reply.");
  }

  return { text: stripMarkdown(text), model: raw.model ?? config.openaiModel };
}

let deterministicProvider: OnboardingAssistantProvider | undefined;

export async function runHallucinationDemo(
  questionId: string,
  industryId: IndustryId,
): Promise<HallucinationDemoResult> {
  const entry = HALLUCINATION_QUESTIONS.find((item) => item.id === questionId);

  if (!entry) {
    throw new Error(`Unknown demo question "${questionId}".`);
  }

  deterministicProvider ??= new OnboardingAssistantProvider();

  const [ungrounded, governed] = await Promise.all([
    askUngrounded(entry.question),
    deterministicProvider.respond({
      message: entry.question,
      industryId,
      history: [],
    }),
  ]);

  return {
    question: entry.question,
    correction: entry.correction,
    ungrounded: { text: ungrounded.text, model: ungrounded.model, grounded: false },
    governed: {
      text: governed.message,
      source: governed.source,
      answered: !governed.source.endsWith(":out-of-scope"),
    },
  };
}
