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
   * This does attribute the correction to Pega — genuinely, as of
   * 2026-08-19: the grounded side reads Pega's own `D_ProductCatalog` Data
   * Page live (see hallucination-demo.ts), not local app config. See
   * groundedOn, which names the exact source so the claim is checkable
   * rather than taken on trust.
   */
  correction: string;
  /** The literal source consulted for the grounded answer — shown so "grounded" is a checkable fact, not a label. */
  groundedOn: string;
}

export const HALLUCINATION_QUESTIONS: readonly HallucinationQuestion[] = [
  {
    id: "documents",
    label: "What documents do I need?",
    question: "What documents do I need to open a business account?",
    correction:
      "The ungrounded model reaches for US concepts — an EIN, a Social Security Number, \"Articles of Incorporation\" — that don't exist in Indian business banking. The grounded answer is read live from Pega's own product data, so nothing it names can be wrong.",
    groundedOn:
      "Pega's D_ProductCatalog Data Page — 5 required documents, read live via the DX API",
  },
  {
    id: "interest-rate",
    label: "What's the interest rate?",
    question: "What is the interest rate on the Everyday Plus Account?",
    correction:
      "The ungrounded model states a specific interest rate with total confidence — Pega's own product data has no such field for this product, so every digit the model states is fabricated. The grounded answer reads that same live data and says so instead of inventing a number.",
    groundedOn:
      "Pega's D_ProductCatalog Data Page — no InterestRate field exists on this product's record, read live via the DX API",
  },
];

export interface HallucinationDemoResult {
  question: string;
  correction: string;
  groundedOn: string;
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
