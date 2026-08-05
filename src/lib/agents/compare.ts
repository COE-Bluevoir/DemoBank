import { randomUUID } from "node:crypto";

import type { AgentDecisionRecord } from "@/lib/agents/contracts";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import { getIndustryPack } from "@/lib/industry/registry";
import type { IndustryId } from "@/lib/industry/types";

/**
 * Compare-and-contrast.
 *
 * One customer request, two executions. The agent-only path interprets the
 * request well; the governed path additionally owns the case, the policy, the
 * SLA, the approval and the audit trail.
 *
 * The point is not that the agent path fails. It is that interpretation
 * without governed execution does not complete an enterprise process, and the
 * difference is easier to see side by side than to argue.
 */

export interface CapabilityComparison {
  dimension: string;
  agentOnly: "yes" | "no" | "partial";
  governed: "yes" | "no" | "partial";
  note: string;
}

/**
 * Fixed capability matrix.
 *
 * Declared rather than derived: these are architectural properties of the two
 * approaches, not observations that vary per request.
 */
const CAPABILITIES: readonly CapabilityComparison[] = [
  {
    dimension: "Understands the request",
    agentOnly: "yes",
    governed: "yes",
    note: "Both use the same agent interpretation.",
  },
  {
    dimension: "Evidence and confidence",
    agentOnly: "yes",
    governed: "yes",
    note: "Extraction and confidence are reported by the same specialists.",
  },
  {
    dimension: "Durable case",
    agentOnly: "no",
    governed: "yes",
    note: "The agent path holds a conversation, not a case that survives it.",
  },
  {
    dimension: "Deterministic policy",
    agentOnly: "no",
    governed: "yes",
    note: "Rules are evaluated by the workflow, not inferred by a model.",
  },
  {
    dimension: "SLA",
    agentOnly: "no",
    governed: "yes",
    note: "No timer exists outside the workflow.",
  },
  {
    dimension: "Assignment and routing",
    agentOnly: "no",
    governed: "yes",
    note: "Work reaches a named queue only in the governed path.",
  },
  {
    dimension: "Human approval",
    agentOnly: "no",
    governed: "yes",
    note: "An agent can recommend; it cannot hold work for a decision.",
  },
  {
    dimension: "Exception handling",
    agentOnly: "no",
    governed: "yes",
    note: "Discrepancies become tracked exceptions, not just observations.",
  },
  {
    dimension: "Audit trail",
    agentOnly: "partial",
    governed: "yes",
    note: "The ledger records agent decisions; the case records the business history.",
  },
  {
    dimension: "Service activation",
    agentOnly: "no",
    governed: "yes",
    note: "Only the workflow calls the systems that open the account.",
  },
];

export interface ComparisonResult {
  correlationId: string;
  message: string;
  industryId: IndustryId;
  interpretation: {
    intent: string;
    confidence: number;
    reply: string;
    grounded?: boolean;
  };
  agentOnly: {
    outcome: string;
    /** What the agent path leaves undone. */
    limitations: string[];
  };
  governed: {
    outcome: string;
    /** What entering the workflow adds. */
    adds: string[];
  };
  capabilities: readonly CapabilityComparison[];
  records: AgentDecisionRecord[];
}

export async function compareExecutionPaths(input: {
  message: string;
  industryId: IndustryId;
}): Promise<ComparisonResult> {
  const correlationId = `corr-${randomUUID()}`;
  const pack = getIndustryPack(input.industryId);

  // Both paths begin with the same interpretation — that is what makes the
  // comparison fair. Running the agent twice would compare two samples of the
  // model, not two architectures.
  const result = await runOrchestrator(
    { message: input.message, history: [], industryId: input.industryId },
    { correlationId },
  );

  const governedNeeded = result.requiresGovernedExecution;

  return {
    correlationId,
    message: input.message,
    industryId: input.industryId,
    interpretation: {
      intent: result.decision.intent,
      confidence: result.decision.confidence,
      reply: result.policyAnswer?.answer ?? result.decision.customerResponse,
      grounded: result.policyAnswer?.grounded,
    },
    agentOnly: {
      outcome: governedNeeded
        ? "Understood the request and replied. Nothing was recorded, assigned or activated."
        : "Answered the question. No further action was required.",
      limitations: governedNeeded
        ? [
            "No case exists once the conversation ends.",
            "No policy was evaluated against the request.",
            "No SLA is running.",
            "No one has been assigned to act on it.",
            `No ${pack.terminology.productNoun} can be ${pack.terminology.activationVerb}.`,
          ]
        : [
            "Nothing to complete — the request was a question.",
            "The answer is not recorded against a case.",
          ],
    },
    governed: {
      outcome: governedNeeded
        ? `The same interpretation is handed to the workflow, which creates the case and drives it to an activated ${pack.terminology.productNoun}.`
        : "The workflow is not engaged: a question does not need a case.",
      adds: governedNeeded
        ? [
            "A durable case with a business identifier.",
            "Deterministic policy evaluation.",
            "SLA and assignment to a work queue.",
            "Human approval where the policy requires it.",
            "Exceptions tracked to resolution.",
            "A complete audit history.",
          ]
        : [
            "Nothing — correctly. Governance applies to work, not to answers.",
          ],
    },
    capabilities: CAPABILITIES,
    records: result.records,
  };
}
