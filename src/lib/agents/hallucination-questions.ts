/**
 * Curated question data for the hallucination-vs-governed demo — pure data,
 * no server-only imports, safe to pull into the client component. The
 * OpenAI call and env config live in hallucination-demo.ts (server-only);
 * splitting them out is what keeps this file importable from
 * components/hallucination-demo.tsx without dragging server/env.ts along.
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
