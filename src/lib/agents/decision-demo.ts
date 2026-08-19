import { getServerConfig } from "@/lib/config/env";

/**
 * "Does it get to make the important calls?" — a live comparison.
 *
 * The question — "should this application be approved automatically, or
 * does it need human review?" — is exactly the class of decision that
 * shouldn't be delegated to a model's opinion. The ungrounded side is a
 * genuine live call, same as the hallucination demo; it'll improvise a
 * plausible-sounding answer because nothing stops it from doing so.
 *
 * The "Pega" side is a fixed example, not a live call: the real rule
 * (`ClearToCreateAuthorization`, confirmed wired into this case type's
 * flow) can't be read live yet — two of its input fields are silently
 * blanked before save by a genuine platform bug, filed as Pega
 * ChangeRequest PEGAACCEL PXC-149. Internal note for whoever wires this up
 * once that's fixed: swap this literal for a live read the same way the
 * other two demos do it, same shape.
 */

export interface DecisionDemoResult {
  question: string;
  ungrounded: { text: string; model: string };
  pega: { text: string; source: string };
}

const QUESTION =
  "Should this application be approved automatically, or does it need human review?";

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .trim();
}

async function askUngrounded(): Promise<{ text: string; model: string }> {
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
        { role: "user", content: QUESTION },
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

export async function runDecisionDemo(): Promise<DecisionDemoResult> {
  const ungrounded = await askUngrounded();

  return {
    question: QUESTION,
    ungrounded,
    pega: {
      text: "Continue — no review needed. The screening and document checks came back clear, so the case proceeds automatically.",
      source: "ClearToCreateAuthorization",
    },
  };
}
