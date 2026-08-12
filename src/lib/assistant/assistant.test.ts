// @vitest-environment node
import { describe, expect, it } from "vitest";

import { OnboardingAssistantProvider } from "@/lib/assistant/onboarding-provider";
import { PegaAssistantProvider } from "@/lib/assistant/pega-provider";
import { AssistantUnavailableError } from "@/lib/assistant/provider";
import { listIndustryPacks } from "@/lib/industry/registry";

/**
 * The assistant answers. It does not act.
 *
 * Both properties matter: a chat box that cannot answer usefully is decorative,
 * and one that can change an application is an authority the customer never
 * granted it and the workflow cannot see.
 */

const assistant = new OnboardingAssistantProvider();

async function ask(message: string, industryId: "banking" | "insurance" | "telecom" = "banking") {
  return assistant.respond({ message, industryId, history: [] });
}

describe("what the assistant knows", () => {
  it("lists the evidence this industry actually asks for", async () => {
    const reply = await ask("what documents do I need?");

    // Grounded in the pack, so it cannot describe a different industry's
    // paperwork or invent a document nobody will accept.
    for (const requirement of listIndustryPacks()
      .find((pack) => pack.id === "banking")!
      .documentProfile.filter((item) => item.mandatory)) {
      expect(reply.message).toContain(requirement.label);
    }
  });

  it("answers each industry in its own terms", async () => {
    const insurance = await ask("tell me about the product", "insurance");
    const telecom = await ask("tell me about the product", "telecom");

    expect(insurance.message).toContain("Meridian Insurance");
    expect(telecom.message).toContain("Vantage Connect");
    expect(insurance.message).not.toContain("NorthStar");
  });

  it("says what it cannot help with rather than inventing an answer", async () => {
    const reply = await ask("what is the interest rate on a mortgage in Peru?");

    // A customer told something wrong about their application acts on it.
    expect(reply.message).toMatch(/could you ask|I can help with/i);
    expect(reply.message).not.toMatch(/\d+(\.\d+)?\s*%/);
  });

  it("declines subjects it has no standing to discuss", async () => {
    // Rates and eligibility for products this journey does not cover. A
    // confident sentence here would be acted on.
    for (const question of [
      "tell me about your mortgage rates",
      "what is the interest rate?",
      "do you offer credit cards?",
    ]) {
      const reply = await ask(question);

      expect(reply.source).toContain("out-of-scope");
      expect(reply.message).toMatch(/outside what I can help with/i);
    }
  });

  it("never claims an application outcome", async () => {
    const questions = [
      "will I be approved?",
      "am I eligible?",
      "has my application been accepted?",
    ];

    for (const question of questions) {
      const reply = await ask(question);

      expect(reply.message).not.toMatch(
        /you (are|will be) (approved|accepted|declined|rejected)/i,
      );
    }
  });
});

describe("what the assistant may not do", () => {
  it("only ever offers navigation, never an action on the case", async () => {
    for (const pack of listIndustryPacks()) {
      for (const question of ["what documents do I need?", "tell me about the product"]) {
        const reply = await assistant.respond({
          message: question,
          industryId: pack.id,
          history: [],
        });

        for (const suggestion of reply.suggestions ?? []) {
          // A link the customer chooses to follow. Anything that submitted on
          // their behalf would bypass the journey the workflow observes.
          expect(suggestion.href.startsWith("/")).toBe(true);
          expect(suggestion.href).not.toMatch(/\/api\//);
        }
      }
    }
  });

  it("reports which system answered", async () => {
    // The console distinguishes an answer from this application from one Pega
    // gave; without the source they are indistinguishable after the fact.
    expect((await ask("help")).source).toContain("onboarding-guide");
  });
});

describe("Pega as the backend", () => {
  it("refuses rather than quietly answering as something else", async () => {
    // Falling back here would let the demo claim Pega answered when it did
    // not, which is precisely what this comparison cannot afford.
    await expect(
      new PegaAssistantProvider().respond({
        message: "what documents do I need?",
        industryId: "banking",
        history: [],
      }),
    ).rejects.toBeInstanceOf(AssistantUnavailableError);
  });

  it("keeps the technical reason out of what the customer sees", async () => {
    let error: AssistantUnavailableError | undefined;

    try {
      await new PegaAssistantProvider().respond({
        message: "hello",
        industryId: "banking",
        history: [],
      });
    } catch (caught) {
      error = caught as AssistantUnavailableError;
    }

    expect(error?.message).toMatch(/PEGA_ASSISTANT_URL|not configured/i);
    expect(error?.customerMessage).not.toMatch(/PEGA_ASSISTANT_URL/);
  });
});
