// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { requiresGovernedExecution } from "@/lib/agents/contracts";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import type {
  AgentProvider,
  CompletionRequest,
  CompletionResult,
} from "@/lib/agents/provider";
import { AgentProviderError } from "@/lib/agents/provider";
import { DeterministicAgentProvider } from "@/lib/agents/providers/deterministic";
import {
  extractJsonObject,
  toInferenceProfileId,
} from "@/lib/agents/providers/bedrock";

const deterministic = new DeterministicAgentProvider();

/** Provider that returns whatever the test dictates, per prompt template. */
function stubProvider(
  responses: Record<string, unknown>,
  name: "deterministic" | "bedrock" = "bedrock",
): AgentProvider {
  return {
    name,
    async complete<TSchema extends z.ZodType>(
      request: CompletionRequest<TSchema>,
    ): Promise<CompletionResult<z.infer<TSchema>>> {
      const candidate = responses[request.promptTemplateId];

      if (candidate === undefined) {
        throw new AgentProviderError(`no stub for ${request.promptTemplateId}`);
      }

      return {
        value: request.schema.parse(candidate),
        modelId: "stub-model",
        repaired: false,
      };
    },
  };
}

describe("governed execution decision", () => {
  it("requires governance only for state-changing intents", () => {
    expect(requiresGovernedExecution("OPEN_ACCOUNT")).toBe(true);
    expect(requiresGovernedExecution("PROVIDE_DETAILS")).toBe(true);
    expect(requiresGovernedExecution("UPLOAD_DOCUMENT")).toBe(true);

    expect(requiresGovernedExecution("ASK_POLICY")).toBe(false);
    expect(requiresGovernedExecution("CHECK_STATUS")).toBe(false);
    expect(requiresGovernedExecution("OUT_OF_SCOPE")).toBe(false);
  });

  it("is decided in code, not taken from the model", async () => {
    // The model claims a policy question, which must never reach the workflow
    // regardless of what else it returns.
    const provider = stubProvider({
      "orchestrator-intent": {
        intent: "ASK_POLICY",
        delegateTo: "none",
        customerResponse: "Here is the answer.",
        extractedFields: {},
        confidence: 0.99,
      },
    });

    const result = await runOrchestrator(
      { message: "what documents do I need?", history: [], industryId: "banking" },
      { provider },
    );

    expect(result.requiresGovernedExecution).toBe(false);
  });
});

describe("orchestrator", () => {
  it("answers a policy question without requiring governance", async () => {
    const result = await runOrchestrator(
      {
        message: "What documents do I need to open an everyday account?",
        history: [],
        industryId: "banking",
      },
      { provider: deterministic },
    );

    expect(result.decision.intent).toBe("ASK_POLICY");
    expect(result.requiresGovernedExecution).toBe(false);
  });

  it("routes an application request into governed execution", async () => {
    const result = await runOrchestrator(
      { message: "I want to open an account", history: [], industryId: "banking" },
      { provider: deterministic },
    );

    expect(result.decision.intent).toBe("OPEN_ACCOUNT");
    expect(result.requiresGovernedExecution).toBe(true);
  });

  it("drops extracted fields the industry pack does not collect", async () => {
    const provider = stubProvider({
      "orchestrator-intent": {
        intent: "PROVIDE_DETAILS",
        delegateTo: "none",
        customerResponse: "Noted.",
        // `nationalInsuranceNumber` is invented; it must not survive.
        extractedFields: {
          firstName: "Ananya",
          nationalInsuranceNumber: "QQ123456C",
        },
        confidence: 0.9,
      },
    });

    const result = await runOrchestrator(
      { message: "my name is Ananya Rao", history: [], industryId: "banking" },
      { provider },
    );

    expect(result.decision.extractedFields).toEqual({ firstName: "Ananya" });
  });

  it("discards empty extracted values", async () => {
    const provider = stubProvider({
      "orchestrator-intent": {
        intent: "PROVIDE_DETAILS",
        delegateTo: "none",
        customerResponse: "Noted.",
        extractedFields: { firstName: "Ananya", lastName: "   " },
        confidence: 0.8,
      },
    });

    const result = await runOrchestrator(
      { message: "I am Ananya", history: [], industryId: "banking" },
      { provider },
    );

    expect(result.decision.extractedFields).toEqual({ firstName: "Ananya" });
  });

  it("delegates to the policy agent and returns its answer", async () => {
    const provider = stubProvider({
      "orchestrator-intent": {
        intent: "ASK_POLICY",
        delegateTo: "policy",
        customerResponse: "Let me check.",
        extractedFields: {},
        confidence: 0.8,
      },
      "policy-answer": {
        answer: "You need an identity document and proof of address.",
        grounded: true,
        sources: ["Required evidence"],
        confidence: 0.9,
      },
    });

    const result = await runOrchestrator(
      { message: "what do I need?", history: [], industryId: "banking" },
      { provider },
    );

    expect(result.policyAnswer?.grounded).toBe(true);
    expect(result.records.map((record) => record.actor)).toEqual([
      "orchestrator",
      "policy",
    ]);
  });

  it("survives a failing specialist and records the failure", async () => {
    // Only the orchestrator template is stubbed, so the policy call throws.
    const provider = stubProvider({
      "orchestrator-intent": {
        intent: "ASK_POLICY",
        delegateTo: "policy",
        customerResponse: "Let me check.",
        extractedFields: {},
        confidence: 0.8,
      },
    });

    const result = await runOrchestrator(
      { message: "what do I need?", history: [], industryId: "banking" },
      { provider },
    );

    expect(result.policyAnswer).toBeUndefined();
    expect(result.decision.customerResponse).toBe("Let me check.");

    const policyRecord = result.records.find(
      (record) => record.actor === "policy",
    );
    expect(policyRecord?.outcome).toBe("failed");
  });
});

describe("governance records", () => {
  it("records what produced every decision", async () => {
    const result = await runOrchestrator(
      { message: "I want to open an account", history: [], industryId: "banking" },
      { provider: deterministic, correlationId: "corr-fixed" },
    );

    const [record] = result.records;

    expect(record.correlationId).toBe("corr-fixed");
    expect(record.actor).toBe("orchestrator");
    expect(record.provider).toBe("deterministic");
    expect(record.promptTemplateId).toBe("orchestrator-intent");
    expect(record.promptVersion).toBeTruthy();
    expect(record.industryId).toBe("banking");
    expect(record.requiresGovernedExecution).toBe(true);
    expect(record.outcome).toBe("succeeded");
    expect(record.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("summarises rather than copying the customer's message", async () => {
    const message = `I want to open an account. ${"x".repeat(400)}`;

    const result = await runOrchestrator(
      { message, history: [], industryId: "banking" },
      { provider: deterministic },
    );

    expect(result.records[0].inputSummary.length).toBeLessThan(message.length);
    expect(result.records[0].inputSummary.endsWith("…")).toBe(true);
  });
});

describe("deterministic provider", () => {
  it("does not claim grounding it cannot support", async () => {
    const result = await runOrchestrator(
      { message: "what are the fees?", history: [], industryId: "banking" },
      { provider: deterministic },
    );

    // With no knowledge base attached, an honest "I cannot confirm" beats a
    // confident invention.
    expect(result.decision.intent).toBe("ASK_POLICY");
  });

  it("extracts only unambiguous values", async () => {
    const result = await runOrchestrator(
      {
        message: "my name is Ananya Rao and my email is ananya@example.test",
        history: [],
        industryId: "banking",
      },
      { provider: deterministic },
    );

    expect(result.decision.extractedFields.firstName).toBe("Ananya");
    expect(result.decision.extractedFields.lastName).toBe("Rao");
    expect(result.decision.extractedFields.email).toBe("ananya@example.test");
  });
});

describe("bedrock helpers", () => {
  it("adds the inference-profile prefix bare model ids need", () => {
    expect(toInferenceProfileId("amazon.nova-pro-v1:0", "us-east-1")).toBe(
      "us.amazon.nova-pro-v1:0",
    );
    expect(toInferenceProfileId("amazon.nova-pro-v1:0", "eu-west-1")).toBe(
      "eu.amazon.nova-pro-v1:0",
    );
    expect(toInferenceProfileId("amazon.nova-pro-v1:0", "ap-south-1")).toBe(
      "apac.amazon.nova-pro-v1:0",
    );
  });

  it("leaves an already-prefixed id alone", () => {
    expect(toInferenceProfileId("us.amazon.nova-pro-v1:0", "us-east-1")).toBe(
      "us.amazon.nova-pro-v1:0",
    );
  });

  it("recovers JSON from a fenced or chatty response", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('Sure! {"a":1} hope that helps')).toEqual({ a: 1 });
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("rejects a response with no JSON at all", () => {
    expect(() => extractJsonObject("I cannot help with that.")).toThrow();
  });
});
