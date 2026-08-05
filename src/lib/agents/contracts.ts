import { z } from "zod";

/**
 * Agent contracts.
 *
 * Every agent returns structured output that is validated before anything acts
 * on it. No free text is ever parsed to drive a decision — a model that
 * produces prose instead of the agreed shape is treated as a failure, not
 * interpreted.
 */

/** What the customer is trying to do. */
export const intentSchema = z.enum([
  "ASK_POLICY",
  "OPEN_ACCOUNT",
  "PROVIDE_DETAILS",
  "UPLOAD_DOCUMENT",
  "CHECK_STATUS",
  "OUT_OF_SCOPE",
]);

export type Intent = z.infer<typeof intentSchema>;

/** Which specialist should answer, if any. */
export const delegateSchema = z.enum(["policy", "document", "screening", "none"]);

/**
 * Intents that change durable state and therefore require the governed
 * workflow. Answering a question does not; opening an account does.
 *
 * This mapping is deterministic and lives outside the model on purpose: a
 * language model must not be the thing that decides whether governance
 * applies.
 */
const GOVERNED_INTENTS: ReadonlySet<Intent> = new Set<Intent>([
  "OPEN_ACCOUNT",
  "PROVIDE_DETAILS",
  "UPLOAD_DOCUMENT",
]);

export function requiresGovernedExecution(intent: Intent): boolean {
  return GOVERNED_INTENTS.has(intent);
}

/**
 * Which specialist answers each intent.
 *
 * Derived in code for the same reason as governance: routing is a fixed
 * mapping, and leaving it to the model means an identical question sometimes
 * reaches the policy agent and sometimes does not.
 */
const DELEGATE_BY_INTENT: Record<Intent, z.infer<typeof delegateSchema>> = {
  ASK_POLICY: "policy",
  UPLOAD_DOCUMENT: "document",
  OPEN_ACCOUNT: "none",
  PROVIDE_DETAILS: "none",
  CHECK_STATUS: "none",
  OUT_OF_SCOPE: "none",
};

export function delegateForIntent(
  intent: Intent,
): z.infer<typeof delegateSchema> {
  return DELEGATE_BY_INTENT[intent];
}

/** A single turn of the conversation. */
export const conversationTurnSchema = z.object({
  role: z.enum(["customer", "assistant"]),
  content: z.string(),
});

export type ConversationTurn = z.infer<typeof conversationTurnSchema>;

export const orchestratorRequestSchema = z.object({
  message: z.string().min(1),
  history: z.array(conversationTurnSchema).default([]),
  industryId: z.enum(["banking", "insurance", "telecom"]),
  /** Present once an application exists, so the agent can reference it. */
  caseId: z.string().optional(),
});

export type OrchestratorRequest = z.infer<typeof orchestratorRequestSchema>;

/**
 * The orchestrator's decision.
 *
 * `requiresGovernedExecution` is derived from the intent by the code above,
 * never taken from the model's own output.
 */
export const orchestratorDecisionSchema = z.object({
  intent: intentSchema,
  delegateTo: delegateSchema,
  /** Plain text, safe to render to the customer. */
  customerResponse: z.string().min(1),
  /** Applicant details the customer supplied in this message, if any. */
  extractedFields: z.record(z.string(), z.string()).default({}),
  confidence: z.number().min(0).max(1),
});

export type OrchestratorDecision = z.infer<typeof orchestratorDecisionSchema>;

/** What the model is asked to produce. Governance is added afterwards. */
export const orchestratorModelOutputSchema = orchestratorDecisionSchema.pick({
  intent: true,
  delegateTo: true,
  customerResponse: true,
  extractedFields: true,
  confidence: true,
});

export const policyRequestSchema = z.object({
  question: z.string().min(1),
  industryId: z.enum(["banking", "insurance", "telecom"]),
});

export type PolicyRequest = z.infer<typeof policyRequestSchema>;

/**
 * A grounded policy answer.
 *
 * `grounded` false means the agent could not support the answer from approved
 * material. The caller decides what to do with that; the agent does not
 * quietly guess.
 */
export const policyAnswerSchema = z.object({
  answer: z.string().min(1),
  grounded: z.boolean(),
  /** Which approved sources supported the answer. */
  sources: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

export type PolicyAnswer = z.infer<typeof policyAnswerSchema>;

/**
 * One auditable record per agent decision.
 *
 * Written before the result is used, so an action can always be traced back to
 * the model, prompt and configuration that produced it.
 */
export interface AgentDecisionRecord {
  correlationId: string;
  caseId?: string;
  industryId: string;
  actor: "orchestrator" | "policy" | "document" | "screening";
  provider: "deterministic" | "bedrock";
  modelId?: string;
  promptTemplateId: string;
  promptVersion: string;
  packVersion: string;
  intent?: Intent;
  requiresGovernedExecution?: boolean;
  confidence?: number;
  grounded?: boolean;
  /** Never the full customer message; enough to trace, not to leak. */
  inputSummary: string;
  outputSummary: string;
  latencyMs: number;
  outcome: "succeeded" | "failed" | "repaired";
  failureReason?: string;
  timestamp: string;
}

/** The full response returned to the caller. */
export interface OrchestratorResult {
  decision: OrchestratorDecision;
  requiresGovernedExecution: boolean;
  policyAnswer?: PolicyAnswer;
  records: AgentDecisionRecord[];
}
