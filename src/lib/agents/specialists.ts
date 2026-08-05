import type { AgentDecisionRecord } from "@/lib/agents/contracts";
import {
  type ToolInvoker,
  type ToolResult,
  getToolInvoker,
} from "@/lib/agents/tools";
import type { IndustryPack } from "@/lib/industry/types";

/**
 * Document and screening specialists.
 *
 * Both follow the same shape: call the registered enterprise tools, then
 * report structured findings. Neither decides an outcome — a discrepancy is
 * described, not adjudicated, and a screening hit is reported, not cleared.
 * Those judgements belong to the workflow.
 */

export const DOCUMENT_AGENT_ID = "document-review";
export const DOCUMENT_AGENT_VERSION = "1.0.0";
export const SCREENING_AGENT_ID = "screening-review";
export const SCREENING_AGENT_VERSION = "1.0.0";

/** Address shape shared with the tool contracts. */
interface PostalAddress {
  addressLine1: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export interface DocumentFinding {
  /** What the documents say, as extracted. */
  extracted: {
    fullName?: string;
    dateOfBirth?: string;
    documentNumber?: string;
    address?: PostalAddress;
  };
  /** Differences between the application and the evidence. */
  discrepancies: Array<{
    field: string;
    applicationValue: string;
    documentValue: string;
    /** Advisory. The workflow decides how a discrepancy is handled. */
    suggestedClassification: "CORRECTABLE" | "MATERIAL" | "HARD_STOP";
  }>;
  /** Lowest extraction confidence across the documents examined. */
  confidence: number;
  toolsInvoked: string[];
}

export interface ScreeningFinding {
  results: Array<{
    check: string;
    outcome: string;
    /** Present where the provider reports one. */
    detail?: string;
  }>;
  /** True when any check needs a human to look at it. */
  requiresHumanReview: boolean;
  toolsInvoked: string[];
}

interface SpecialistContext {
  caseId: string;
  correlationId: string;
  pack: IndustryPack;
  invoker?: ToolInvoker;
  records: AgentDecisionRecord[];
}

function record(
  context: SpecialistContext,
  actor: "document" | "screening",
  promptTemplateId: string,
  promptVersion: string,
  startedAt: number,
  outcome: AgentDecisionRecord["outcome"],
  summary: string,
  extra: Partial<AgentDecisionRecord> = {},
): void {
  context.records.push({
    correlationId: context.correlationId,
    caseId: context.caseId,
    industryId: context.pack.id,
    actor,
    // These specialists reason over tool output rather than model output, so
    // the decision is deterministic and recorded as such.
    provider: "deterministic",
    promptTemplateId,
    promptVersion,
    packVersion: "1.0.0",
    inputSummary: `case ${context.caseId}`,
    outputSummary: summary,
    latencyMs: Date.now() - startedAt,
    outcome,
    timestamp: new Date().toISOString(),
    ...extra,
  });
}

/**
 * Read the customer's evidence and compare it with what they told us.
 *
 * Reports differences; it does not decide whether the application proceeds.
 */
export async function reviewDocuments(
  context: SpecialistContext,
  application: {
    fullName: string;
    address: PostalAddress;
    identityStorageReference: string;
    addressStorageReference: string;
  },
): Promise<DocumentFinding> {
  const invoker = context.invoker ?? getToolInvoker();
  const startedAt = Date.now();
  const toolsInvoked: string[] = [];

  const identity = (await invoker.invoke({
    tool: "extract-identity",
    input: {
      caseId: context.caseId,
      documentId: `${context.caseId}-IDENTITY`,
      storageReference: application.identityStorageReference,
    },
  })) as ToolResult<{
    fullName: string;
    dateOfBirth: string;
    documentNumber: string;
    extractionConfidence: number;
  }>;
  toolsInvoked.push(identity.tool);

  const address = (await invoker.invoke({
    tool: "extract-address",
    input: {
      caseId: context.caseId,
      documentId: `${context.caseId}-ADDRESS`,
      storageReference: application.addressStorageReference,
    },
  })) as ToolResult<{
    address: PostalAddress;
    extractionConfidence: number;
  }>;
  toolsInvoked.push(address.tool);

  const validation = (await invoker.invoke({
    tool: "validate-address",
    input: {
      caseId: context.caseId,
      applicationAddress: application.address,
      documentAddress: address.output.address,
    },
  })) as ToolResult<{
    mismatch?: {
      field: string;
      applicationValue: string;
      documentValue: string;
      suggestedClassification: "CORRECTABLE" | "MATERIAL" | "HARD_STOP";
    };
  }>;
  toolsInvoked.push(validation.tool);

  const discrepancies: DocumentFinding["discrepancies"] = [];

  if (validation.output.mismatch) {
    discrepancies.push(validation.output.mismatch);
  }

  // A name that does not match the identity document is material: it is the
  // one field the evidence exists to corroborate.
  if (
    identity.output.fullName &&
    application.fullName &&
    identity.output.fullName.trim().toLowerCase() !==
      application.fullName.trim().toLowerCase()
  ) {
    discrepancies.push({
      field: "fullName",
      applicationValue: application.fullName,
      documentValue: identity.output.fullName,
      suggestedClassification: "MATERIAL",
    });
  }

  const finding: DocumentFinding = {
    extracted: {
      fullName: identity.output.fullName,
      dateOfBirth: identity.output.dateOfBirth,
      documentNumber: identity.output.documentNumber,
      address: address.output.address,
    },
    discrepancies,
    confidence: Math.min(
      identity.output.extractionConfidence,
      address.output.extractionConfidence,
    ),
    toolsInvoked,
  };

  record(
    context,
    "document",
    DOCUMENT_AGENT_ID,
    DOCUMENT_AGENT_VERSION,
    startedAt,
    "succeeded",
    discrepancies.length === 0
      ? "Documents corroborate the application."
      : `${discrepancies.length} discrepancy(ies) found.`,
    { confidence: finding.confidence },
  );

  return finding;
}

/**
 * Run the screening checks and report what came back.
 *
 * A potential match is surfaced for a human, never resolved here.
 */
export async function reviewScreening(
  context: SpecialistContext,
  applicant: {
    fullName: string;
    dateOfBirth: string;
    nationality: string;
    email: string;
    mobile: string;
    postalCode: string;
  },
): Promise<ScreeningFinding> {
  const invoker = context.invoker ?? getToolInvoker();
  const startedAt = Date.now();
  const toolsInvoked: string[] = [];
  const results: ScreeningFinding["results"] = [];

  const screeningInput = {
    caseId: context.caseId,
    fullName: applicant.fullName,
    dateOfBirth: applicant.dateOfBirth,
    nationality: applicant.nationality,
  };

  for (const tool of ["screen-sanctions", "screen-pep"] as const) {
    const result = (await invoker.invoke({
      tool,
      input: screeningInput,
    })) as ToolResult<{ outcome: string; reasonCodes: string[] }>;

    toolsInvoked.push(result.tool);
    results.push({
      check: tool,
      outcome: result.output.outcome,
      detail: result.output.reasonCodes.join(", "),
    });
  }

  const duplicate = (await invoker.invoke({
    tool: "check-duplicate",
    input: {
      caseId: context.caseId,
      fullName: applicant.fullName,
      dateOfBirth: applicant.dateOfBirth,
      email: applicant.email,
      mobile: applicant.mobile,
    },
  })) as ToolResult<{ outcome: string; reasonCodes: string[] }>;
  toolsInvoked.push(duplicate.tool);
  results.push({
    check: "check-duplicate",
    outcome: duplicate.output.outcome,
    detail: duplicate.output.reasonCodes.join(", "),
  });

  const bureau = (await invoker.invoke({
    tool: "check-credit-bureau",
    input: {
      caseId: context.caseId,
      fullName: applicant.fullName,
      dateOfBirth: applicant.dateOfBirth,
      postalCode: applicant.postalCode,
    },
  })) as ToolResult<{ outcome: string; scoreBand: string; reasonCodes: string[] }>;
  toolsInvoked.push(bureau.tool);
  results.push({
    check: "check-credit-bureau",
    outcome: bureau.output.outcome,
    detail: `${bureau.output.scoreBand}; ${bureau.output.reasonCodes.join(", ")}`,
  });

  // Anything short of a clean pass is escalated rather than interpreted.
  const requiresHumanReview = results.some(
    (item) => item.outcome !== "CLEAR" && item.outcome !== "PASSED",
  );

  record(
    context,
    "screening",
    SCREENING_AGENT_ID,
    SCREENING_AGENT_VERSION,
    startedAt,
    "succeeded",
    requiresHumanReview
      ? "One or more checks require human review."
      : "All checks returned clear.",
    { requiresGovernedExecution: requiresHumanReview },
  );

  return { results, requiresHumanReview, toolsInvoked };
}
