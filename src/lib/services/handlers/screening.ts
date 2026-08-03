import { z } from "zod";

import { DEMO_CUSTOMER } from "@/lib/onboarding/constants";
import type {
  duplicateCheckRequestSchema,
  duplicateCheckResultSchema,
  screeningRequestSchema,
  screeningResultSchema,
} from "@/lib/services/contracts";
import {
  deterministicReference,
  deterministicScore,
  normalizeForComparison,
} from "@/lib/services/deterministic";

/**
 * Screening tools: sanctions, PEP and duplicate detection.
 *
 * Each returns structured evidence and never a decision. Whether a potential
 * match blocks the journey, creates an exception or routes to a reviewer is
 * decided by the orchestration rules, not here.
 */

type ScreeningRequest = z.infer<typeof screeningRequestSchema>;
type ScreeningResult = z.infer<typeof screeningResultSchema>;
type DuplicateCheckRequest = z.infer<typeof duplicateCheckRequestSchema>;
type DuplicateCheckResult = z.infer<typeof duplicateCheckResultSchema>;

const SANCTIONS_LISTS = [
  "UN Consolidated",
  "EU Consolidated",
  "OFAC SDN",
  "HM Treasury",
];

const PEP_LISTS = ["Global PEP Register", "Domestic PEP Register"];

/** The scripted scenario raises a low-confidence PEP candidate for this name. */
const PEP_REVIEW_NAME = normalizeForComparison(DEMO_CUSTOMER.fullName);

export function screenSanctions(request: ScreeningRequest): ScreeningResult {
  const seed = `sanctions:${request.caseId}:${request.fullName}`;

  return {
    outcome: "CLEAR",
    matchConfidence: deterministicScore(seed, 0.01, 0.08),
    listsSearched: SANCTIONS_LISTS,
    candidates: [],
    reasonCodes: ["NO_SANCTIONS_MATCH"],
  };
}

/**
 * PEP screening.
 *
 * For the scripted applicant this returns a deliberately low-confidence
 * candidate. It is reported as `POTENTIAL_MATCH` rather than resolved either
 * way: an agent must not self-clear an ambiguous political-exposure hit.
 */
export function screenPep(request: ScreeningRequest): ScreeningResult {
  const seed = `pep:${request.caseId}:${request.fullName}`;

  if (normalizeForComparison(request.fullName) !== PEP_REVIEW_NAME) {
    return {
      outcome: "CLEAR",
      matchConfidence: deterministicScore(seed, 0.02, 0.1),
      listsSearched: PEP_LISTS,
      candidates: [],
      reasonCodes: ["NO_PEP_MATCH"],
    };
  }

  const matchConfidence = 0.62;

  return {
    outcome: "POTENTIAL_MATCH",
    matchConfidence,
    listsSearched: PEP_LISTS,
    candidates: [
      {
        candidateId: deterministicReference("PEP", seed),
        name: request.fullName,
        matchConfidence,
        listName: "Global PEP Register",
      },
    ],
    reasonCodes: [
      "PEP_NAME_SIMILARITY",
      "LOW_CONFIDENCE",
      "MANUAL_REVIEW_RECOMMENDED",
    ],
  };
}

export function checkDuplicate(
  request: DuplicateCheckRequest,
): DuplicateCheckResult {
  const seed = `duplicate:${request.caseId}:${request.email}`;

  return {
    outcome: "CLEAR",
    matchConfidence: deterministicScore(seed, 0.0, 0.05),
    reasonCodes: ["NO_EXISTING_CUSTOMER_MATCH"],
  };
}
