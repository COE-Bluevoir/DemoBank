import { randomUUID } from "node:crypto";

import {
  type AgentDecisionRecord,
  type OrchestratorRequest,
  type OrchestratorResult,
  type PolicyAnswer,
  delegateForIntent,
  orchestratorModelOutputSchema,
  policyAnswerSchema,
  requiresGovernedExecution,
} from "@/lib/agents/contracts";
import {
  ORCHESTRATOR_PROMPT_ID,
  ORCHESTRATOR_PROMPT_VERSION,
  POLICY_PROMPT_ID,
  POLICY_PROMPT_VERSION,
  orchestratorSystemPrompt,
  policySystemPrompt,
} from "@/lib/agents/prompts";
import { getAgentLedger } from "@/lib/agents/ledger";
import { getAgentProvider } from "@/lib/agents/registry";
import type { AgentProvider } from "@/lib/agents/provider";
import { AgentProviderError } from "@/lib/agents/provider";
import { getIndustryPack } from "@/lib/industry/registry";
import type { IndustryPack } from "@/lib/industry/types";

/**
 * The orchestrator.
 *
 * Interprets the customer's message, delegates to a specialist when one is
 * needed, and reports whether the interaction requires governed execution.
 * It never decides eligibility, applies policy, or changes case state — those
 * belong to the workflow.
 */

const PACK_VERSION = "1.0.0";

/** Enough to trace a decision without copying customer data into the log. */
function summarise(text: string, limit = 120): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > limit
    ? `${collapsed.slice(0, limit)}…`
    : collapsed;
}

function buildConversation(request: OrchestratorRequest): string {
  const history = request.history
    .slice(-6)
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join("\n");

  return history
    ? `Conversation so far:\n${history}\n\ncustomer: ${request.message}`
    : `customer: ${request.message}`;
}

/**
 * Only forward fields the pack actually collects.
 *
 * A model that invents a key must not be able to write it into the case.
 */
function restrictToPackFields(
  extracted: Record<string, string>,
  pack: IndustryPack,
): Record<string, string> {
  const allowed = new Set<string>(pack.intakeFields.map((field) => field.key));

  return Object.fromEntries(
    Object.entries(extracted).filter(
      ([key, value]) => allowed.has(key) && value.trim().length > 0,
    ),
  );
}

async function answerPolicyQuestion(
  provider: AgentProvider,
  request: OrchestratorRequest,
  pack: IndustryPack,
  correlationId: string,
  records: AgentDecisionRecord[],
): Promise<PolicyAnswer | undefined> {
  const startedAt = Date.now();

  try {
    const result = await provider.complete({
      promptTemplateId: POLICY_PROMPT_ID,
      promptVersion: POLICY_PROMPT_VERSION,
      system: policySystemPrompt(pack),
      user: request.message,
      schema: policyAnswerSchema,
      // Grounded answers cite their sources, so the serialised JSON runs
      // longer than the 60-word answer alone suggests.
      maxTokens: 900,
    });

    records.push({
      correlationId,
      caseId: request.caseId,
      industryId: pack.id,
      actor: "policy",
      provider: provider.name,
      modelId: result.modelId,
      promptTemplateId: POLICY_PROMPT_ID,
      promptVersion: POLICY_PROMPT_VERSION,
      packVersion: PACK_VERSION,
      confidence: result.value.confidence,
      grounded: result.value.grounded,
      inputSummary: summarise(request.message),
      outputSummary: summarise(result.value.answer),
      latencyMs: Date.now() - startedAt,
      outcome: result.repaired ? "repaired" : "succeeded",
      timestamp: new Date().toISOString(),
    });

    return result.value;
  } catch (error) {
    // A specialist failing must not take down the conversation; the
    // orchestrator's own reply still stands.
    records.push({
      correlationId,
      caseId: request.caseId,
      industryId: pack.id,
      actor: "policy",
      provider: provider.name,
      promptTemplateId: POLICY_PROMPT_ID,
      promptVersion: POLICY_PROMPT_VERSION,
      packVersion: PACK_VERSION,
      inputSummary: summarise(request.message),
      outputSummary: "",
      latencyMs: Date.now() - startedAt,
      outcome: "failed",
      failureReason:
        error instanceof Error ? error.message : "Unknown policy agent failure.",
      timestamp: new Date().toISOString(),
    });

    return undefined;
  }
}

export async function runOrchestrator(
  request: OrchestratorRequest,
  options: { provider?: AgentProvider; correlationId?: string } = {},
): Promise<OrchestratorResult> {
  const provider = options.provider ?? getAgentProvider("routing");
  const pack = getIndustryPack(request.industryId);
  const correlationId = options.correlationId ?? `corr-${randomUUID()}`;
  const records: AgentDecisionRecord[] = [];
  const startedAt = Date.now();

  const result = await provider.complete({
    promptTemplateId: ORCHESTRATOR_PROMPT_ID,
    promptVersion: ORCHESTRATOR_PROMPT_VERSION,
    system: orchestratorSystemPrompt(pack),
    user: buildConversation(request),
    schema: orchestratorModelOutputSchema,
    maxTokens: 500,
  });

  // Derived from the intent in code, never taken from the model: whether
  // governance applies is not a judgement a language model should make.
  const governed = requiresGovernedExecution(result.value.intent);

  const decision = {
    ...result.value,
    // Routing is derived, not trusted: the model's own delegateTo varies
    // between identical questions, which would make the demo unrepeatable.
    delegateTo: delegateForIntent(result.value.intent),
    extractedFields: restrictToPackFields(result.value.extractedFields, pack),
  };

  records.push({
    correlationId,
    caseId: request.caseId,
    industryId: pack.id,
    actor: "orchestrator",
    provider: provider.name,
    modelId: result.modelId,
    promptTemplateId: ORCHESTRATOR_PROMPT_ID,
    promptVersion: ORCHESTRATOR_PROMPT_VERSION,
    packVersion: PACK_VERSION,
    intent: decision.intent,
    requiresGovernedExecution: governed,
    confidence: decision.confidence,
    inputSummary: summarise(request.message),
    outputSummary: summarise(decision.customerResponse),
    latencyMs: Date.now() - startedAt,
    outcome: result.repaired ? "repaired" : "succeeded",
    timestamp: new Date().toISOString(),
  });

  const policyAnswer =
    decision.delegateTo === "policy"
      ? await answerPolicyQuestion(
          // Grounded answers need the stronger model; the small routing model
          // cannot reliably hold the policy output contract.
          options.provider ?? getAgentProvider("reasoning"),
          request,
          pack,
          correlationId,
          records,
        )
      : undefined;

  // Written before the caller acts on the result, so an answer can always be
  // traced even if what happens next fails.
  await getAgentLedger().append(records);

  return {
    decision,
    requiresGovernedExecution: governed,
    policyAnswer,
    records,
  };
}

export { AgentProviderError };
