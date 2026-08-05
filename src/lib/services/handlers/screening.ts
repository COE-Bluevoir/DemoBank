import { z } from "zod";

import { formatFullName } from "@/lib/onboarding/applicant-name";
import { DEMO_CUSTOMER } from "@/lib/onboarding/constants";
import type {
  creditBureauRequestSchema,
  creditBureauResultSchema,
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
type CreditBureauRequest = z.infer<typeof creditBureauRequestSchema>;
type CreditBureauResult = z.infer<typeof creditBureauResultSchema>;

const SANCTIONS_LISTS = [
  "UN Consolidated",
  "EU Consolidated",
  "OFAC SDN",
  "HM Treasury",
];

const PEP_LISTS = ["Global PEP Register", "Domestic PEP Register"];

/** The scripted scenario raises a low-confidence PEP candidate for this name. */
const PEP_REVIEW_NAME = normalizeForComparison(formatFullName(DEMO_CUSTOMER));

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

/**
 * Credit bureau enquiry.
 *
 * Returns a score band and reason codes. It deliberately does not say whether
 * the applicant should be accepted: that is a policy decision the workflow
 * owns, and a bureau that returned verdicts would be making it for them.
 */
export function checkCreditBureau(
  request: CreditBureauRequest,
): CreditBureauResult {
  const seed = `bureau:${request.caseId}:${request.fullName}:${request.postalCode}`;
  const score = deterministicScore(seed, 0, 1);

  // Bands rather than a raw number, so nothing downstream can quietly start
  // treating a score as a threshold.
  const scoreBand =
    score > 0.8
      ? "EXCELLENT"
      : score > 0.6
        ? "GOOD"
        : score > 0.35
          ? "FAIR"
          : score > 0.15
            ? "POOR"
            : "NO_HISTORY";

  const fileFound = scoreBand !== "NO_HISTORY";

  return {
    outcome: fileFound ? "PASSED" : "POTENTIAL_MATCH",
    bureau: "northstar-mock-credit-bureau",
    scoreBand,
    fileFound,
    reasonCodes: fileFound
      ? ["FILE_FOUND", "IDENTITY_CORROBORATED"]
      : ["NO_CREDIT_FILE", "MANUAL_REVIEW_RECOMMENDED"],
    enquiryType: "SOFT",
  };
}
