import { getServerConfig } from "@/lib/config/env";
import { fetchProductCatalog } from "@/lib/pega/product-catalog";
import {
  HALLUCINATION_QUESTIONS,
  type HallucinationDemoResult,
} from "@/lib/agents/hallucination-questions";

/**
 * Grounded versus ungrounded, side by side.
 *
 * A marketing-demoable answer to "why does governed execution matter" that
 * isn't a capability table — an actual model, actually asked, actually
 * getting it wrong. Both curated questions (see hallucination-questions.ts)
 * are reproductions of a real failure caught live in this app's own chat
 * widget before its system prompt carried the real document list (see the
 * OpenAI provider's grounding fix): asked with no grounding, gpt-4o-mini
 * confidently invents US business-banking requirements (an EIN, "Articles
 * of Incorporation") for an Indian bank, and a specific fabricated interest
 * rate for a product that has none on file. Deliberately not free text — a
 * live demo needs a failure that reproduces the same way every time, not
 * one that depends on today's sampling.
 *
 * The grounded side reads Pega's `D_ProductCatalog` Data Page live, via
 * fetchProductCatalog() — see docs/pega-hallucination-demo-data-page-handoff.md
 * for why. No silent fallback to local data on failure: if the live read
 * fails, the whole comparison fails (the API route surfaces a 503) rather
 * than quietly substituting local config while still labelling the answer
 * as Pega's.
 *
 * Server-only: imports getServerConfig, which throws if pulled into a
 * client bundle. The client component imports question data from
 * hallucination-questions.ts instead, never from this file.
 */

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

const PEGA_PRODUCT_CATALOG_SOURCE = "Pega Data Page D_ProductCatalog (live)";

/**
 * Both curated questions are about the same reference product, so both
 * answer from the one row Pega actually has for it. Documents: reads the
 * live `RequiredDocuments` list. Interest rate: the row has no such field
 * at all — not blank, absent — so the honest answer is that Pega's data has
 * nothing to report, which is the more convincing fact precisely because
 * it isn't flattering.
 */
async function answerFromPegaCatalog(
  questionId: string,
): Promise<{ text: string; source: string; answered: boolean }> {
  const catalog = await fetchProductCatalog();
  const product = catalog.find((entry) => entry.productCode === "EVERYDAY_PLUS");

  if (!product) {
    throw new Error(
      "Pega's product catalog did not return an EVERYDAY_PLUS entry.",
    );
  }

  if (questionId === "documents") {
    const list = product.requiredDocuments
      .map((document) => `• ${document}`)
      .join("\n");

    return {
      text: `For the ${product.productName} you will need:\n${list}`,
      source: PEGA_PRODUCT_CATALOG_SOURCE,
      answered: true,
    };
  }

  if (questionId === "interest-rate") {
    return {
      text: `Pega's product data for the ${product.productName} has no interest-rate field — there is nothing on file to report.`,
      source: PEGA_PRODUCT_CATALOG_SOURCE,
      answered: false,
    };
  }

  throw new Error(`No Pega-backed answer defined for question "${questionId}".`);
}

export async function runHallucinationDemo(
  questionId: string,
): Promise<HallucinationDemoResult> {
  const entry = HALLUCINATION_QUESTIONS.find((item) => item.id === questionId);

  if (!entry) {
    throw new Error(`Unknown demo question "${questionId}".`);
  }

  const [ungrounded, governed] = await Promise.all([
    askUngrounded(entry.question),
    answerFromPegaCatalog(entry.id),
  ]);

  return {
    question: entry.question,
    correction: entry.correction,
    groundedOn: entry.groundedOn,
    ungrounded: { text: ungrounded.text, model: ungrounded.model, grounded: false },
    governed,
  };
}
