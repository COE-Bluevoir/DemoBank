import { getIndustryPack } from "@/lib/industry/registry";
import type {
  AssistantProvider,
  AssistantReply,
  AssistantRequest,
  AssistantSuggestion,
} from "@/lib/assistant/provider";

/**
 * The assistant this application answers with today.
 *
 * Grounded entirely in the industry pack: what this organisation sells, what
 * evidence it needs, and what the journey does next. It does not speculate
 * about rates, eligibility or approval — those are decisions, and a chat box
 * has no standing to make them.
 *
 * Answers are composed from configuration rather than generated, so the same
 * question gives the same answer in front of an audience. When Pega's
 * conversational channel is available it takes over behind the same interface.
 */

/** "a" or "an", so product names read correctly in a sentence. */
function article(noun: string): string {
  return /^[aeiou]/i.test(noun.trim()) ? "an" : "a";
}

interface Intent {
  readonly id: string;
  readonly matches: RegExp;
  readonly answer: (pack: ReturnType<typeof getIndustryPack>) => string;
  readonly suggests?: (
    pack: ReturnType<typeof getIndustryPack>,
  ) => AssistantSuggestion[];
}

const INTENTS: readonly Intent[] = [
  {
    id: "documents",
    matches: /document|upload|paperwork|evidence|proof|what do i need/i,
    answer: (pack) => {
      const required = pack.documentProfile.filter((item) => item.mandatory);
      const optional = pack.documentProfile.filter((item) => !item.mandatory);

      const lines = required.map((item) => `• ${item.label} — ${item.description}`);

      return [
        `For ${article(pack.brand.productName)} ${pack.brand.productName} you will need:`,
        ...lines,
        optional.length > 0
          ? `Optionally: ${optional.map((item) => item.label).join(", ")}.`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    },
    suggests: (pack) => [
      { label: "Start an application", href: `/onboarding/start?industry=${pack.id}` },
    ],
  },
  {
    id: "how-long",
    matches: /how long|how much time|duration|when will|timeline/i,
    answer: (pack) =>
      `Most of the ${pack.brand.productName} application is completed in a single sitting. ` +
      "After you submit your evidence it is checked automatically, and if anything needs a " +
      "closer look one of our specialists reviews it before your application completes. " +
      "You can follow the progress on your application page at any time.",
  },
  {
    id: "status",
    matches: /status|progress|where is my|track|how is my application/i,
    answer: () =>
      "You can see exactly where your application has reached, including which step is in " +
      "progress, on your application page. If we need anything from you it will be shown " +
      "there, and we will not ask you for the same thing twice.",
  },
  {
    id: "security",
    matches: /secure|security|safe|privacy|data|gdpr|protect/i,
    answer: (pack) =>
      `Documents you upload to ${pack.brand.organisationName} are stored privately and are ` +
      "only used to verify the details of this application. Sensitive steps are handled by " +
      "secure services, and every material decision is recorded so it can be explained later.",
  },
  {
    id: "product",
    // No bare "what is": it swallowed questions about products this
    // organisation does not sell and answered them with its own brochure.
    matches: /\b(product|account|policy|service|plan|tell me about)\b/i,
    answer: (pack) =>
      `${pack.brand.organisationName} offers the ${pack.brand.productName}. ` +
      `${pack.objective} ` +
      `We refer to you as a ${pack.terminology.customerNoun} once your ` +
      `${pack.terminology.productNoun} is ${pack.terminology.activationVerb}.`,
    suggests: (pack) => [
      { label: `Open ${article(pack.brand.productName)} ${pack.brand.productName}`, href: `/onboarding/start?industry=${pack.id}` },
    ],
  },
  {
    id: "help",
    matches: /help|support|contact|speak to|human|agent|adviser/i,
    answer: (pack) =>
      `I can explain what ${pack.brand.organisationName} needs and what happens at each step. ` +
      "If you would rather speak to someone, our support team can pick up your application " +
      "using the reference shown on your application page.",
  },
];

/**
 * The honest answer when nothing matches.
 *
 * Inventing a plausible reply is worse than admitting the limit: a customer
 * who is told something wrong about their application acts on it.
 */
/**
 * Subjects this assistant has no standing to discuss.
 *
 * Every one of these is a product the organisation may or may not offer, on
 * terms nobody here knows. Answering from the onboarding pack would produce a
 * confident sentence about a rate or an eligibility rule that was never
 * checked, and the customer would act on it.
 */
const OUT_OF_SCOPE =
  /\b(mortgages?|home loans?|personal loans?|credit cards?|interest rates?|apr|overdrafts?|investments?|shares?|stocks?|crypto|pensions?)\b/i;

function fallback(pack: ReturnType<typeof getIndustryPack>): string {
  return (
    `I can help with what ${pack.brand.organisationName} needs for ` +
    `${article(pack.brand.productName)} ${pack.brand.productName} — the documents ` +
    "required, how long it takes, " +
    "how your information is protected, and where your application has reached. " +
    "Could you ask about one of those?"
  );
}

export class OnboardingAssistantProvider implements AssistantProvider {
  readonly name = "onboarding-guide";

  async respond(request: AssistantRequest): Promise<AssistantReply> {
    const pack = getIndustryPack(request.industryId);

    // Checked before intent matching: a question about mortgage rates also
    // contains the word "rate" and would otherwise match a product answer.
    if (OUT_OF_SCOPE.test(request.message)) {
      return {
        message:
          `That is outside what I can help with here — I only cover the ` +
          `${pack.brand.productName} onboarding. ${fallback(pack)}`,
        source: `${this.name}:out-of-scope`,
      };
    }

    const intent = INTENTS.find((candidate) =>
      candidate.matches.test(request.message),
    );

    if (!intent) {
      return {
        message: fallback(pack),
        source: this.name,
      };
    }

    return {
      message: intent.answer(pack),
      suggestions: intent.suggests?.(pack),
      source: `${this.name}:${intent.id}`,
    };
  }
}
