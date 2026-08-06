import type { DocumentKind } from "@/lib/onboarding/types";

/**
 * Deterministic policy for the non-Pega orchestration.
 *
 * This is the rules authority when Pega is not in the picture. It is
 * deliberately code, not a model: eligibility, required checks, exception
 * classification and review triggers must be repeatable and auditable, and a
 * language model is neither.
 *
 * Agents feed this engine evidence. The engine decides.
 */

export type ExceptionSeverity = "CORRECTABLE" | "MATERIAL" | "HARD_STOP";

export interface PolicyException {
  code: string;
  field?: string;
  severity: ExceptionSeverity;
  /** Internal wording. Never rendered to a customer. */
  detail: string;
  raisedAt: string;
}

export interface PolicyInputs {
  hasApplicant: boolean;
  hasConsent: boolean;
  documentKinds: DocumentKind[];
  requiredDocumentKinds: DocumentKind[];
  documentDiscrepancies: Array<{
    field: string;
    severity: ExceptionSeverity;
    detail: string;
  }>;
  screeningResults: Array<{ check: string; outcome: string; detail?: string }>;
}

export interface PolicyVerdict {
  exceptions: PolicyException[];
  /** True when a person must look at the case before it proceeds. */
  requiresHumanReview: boolean;
  /** True when nothing further can be done automatically. */
  blocked: boolean;
  /** Codes explaining the verdict, for the audit trail. */
  reasonCodes: string[];
}

/** Screening outcomes that are unambiguously clean. */
const CLEAN_OUTCOMES = new Set(["CLEAR", "PASSED"]);

function now(): string {
  return new Date().toISOString();
}

/**
 * Evaluate the case against policy.
 *
 * Every path that could let an application through without a human looking at
 * it is enumerated explicitly; anything unrecognised escalates rather than
 * passes, because an unknown screening outcome is not evidence of innocence.
 */
export function evaluatePolicy(inputs: PolicyInputs): PolicyVerdict {
  const exceptions: PolicyException[] = [];
  const reasonCodes: string[] = [];

  const missingDocuments = inputs.requiredDocumentKinds.filter(
    (kind) => !inputs.documentKinds.includes(kind),
  );

  if (missingDocuments.length > 0) {
    reasonCodes.push("EVIDENCE_INCOMPLETE");
  }

  for (const discrepancy of inputs.documentDiscrepancies) {
    exceptions.push({
      code: "DOCUMENT_DISCREPANCY",
      field: discrepancy.field,
      severity: discrepancy.severity,
      detail: discrepancy.detail,
      raisedAt: now(),
    });
  }

  for (const result of inputs.screeningResults) {
    if (CLEAN_OUTCOMES.has(result.outcome)) {
      continue;
    }

    // A failed check stops the case; anything else ambiguous goes to a human.
    exceptions.push({
      code: `SCREENING_${result.check.toUpperCase().replace(/-/g, "_")}`,
      severity: result.outcome === "FAILED" ? "HARD_STOP" : "MATERIAL",
      detail: result.detail ?? result.outcome,
      raisedAt: now(),
    });
  }

  const hardStop = exceptions.some((item) => item.severity === "HARD_STOP");

  // A correctable discrepancy is resolved with the customer, not a reviewer.
  const needsReview =
    !hardStop && exceptions.some((item) => item.severity === "MATERIAL");

  if (hardStop) {
    reasonCodes.push("HARD_STOP");
  }

  if (needsReview) {
    reasonCodes.push("MANUAL_REVIEW_REQUIRED");
  }

  if (exceptions.length === 0 && missingDocuments.length === 0) {
    reasonCodes.push("ALL_CHECKS_CLEAR");
  }

  return {
    exceptions,
    requiresHumanReview: needsReview,
    blocked: hardStop,
    reasonCodes,
  };
}

/** Which checks this orchestration runs before a case may complete. */
export const REQUIRED_SCREENING_CHECKS = [
  "screen-sanctions",
  "screen-pep",
  "check-duplicate",
  "check-credit-bureau",
] as const;

/**
 * Whether the applicant may be created.
 *
 * Separate from `evaluatePolicy` because activation is the one irreversible
 * step and should read as a single explicit condition.
 */
export function mayActivate(
  verdict: PolicyVerdict,
  reviewCleared: boolean,
): boolean {
  if (verdict.blocked) {
    return false;
  }

  if (verdict.requiresHumanReview && !reviewCleared) {
    return false;
  }

  return true;
}
