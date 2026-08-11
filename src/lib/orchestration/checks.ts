import type { IndustryPack } from "@/lib/industry/types";
import { type McpToolName, type ToolResponse } from "@/lib/mcp/envelope";
import { MCP_HANDLERS } from "@/lib/mcp/tools";

/**
 * Runs the external checks a journey calls for.
 *
 * Which checks run is configuration, not code: a telecom order asks whether
 * the site can be served and does not screen a warehouse for sanctions, while
 * a bank does the reverse. Hardcoding the banking sequence is what would make
 * the other two industries a rebrand rather than an adaptation.
 *
 * Nothing here decides anything. Each tool reports a finding and the findings
 * are handed to the policy engine, which is the only thing entitled to say
 * what they mean.
 */

export interface CheckFinding {
  /** The contracted tool that produced it. */
  check: McpToolName;
  /** The provider's own verdict, unmodified. */
  outcome: string;
  reasonCode?: string;
  confidence?: number;
  detail?: string;
  evidence?: Record<string, unknown>;
  providerReference: string;
}

/** Findings the policy engine should treat as clean. */
const CLEAN = new Set([
  "CLEAR",
  "PASS",
  "PASSED",
  "VALID",
  "VERIFIED",
  "NO_MATCH",
  "AVAILABLE",
  "SUCCESS",
  "SENT",
]);

export function isCleanOutcome(outcome: string): boolean {
  return CLEAN.has(outcome);
}

/** The checks a journey runs, in the order the storyline packs specify. */
function plannedChecks(pack: IndustryPack): McpToolName[] {
  const profile = pack.checkProfile;

  const planned: Array<[boolean, McpToolName]> = [
    [profile.verifyEntity, "verify_entity"],
    [profile.validateAddress, "validate_address"],
    [profile.checkDuplicate, "check_duplicate"],
    [profile.checkServiceability, "check_serviceability"],
    [profile.screenParty, "screen_party"],
    [profile.evaluateExternalRisk, "evaluate_external_risk"],
  ];

  return planned.filter(([enabled]) => enabled).map(([, tool]) => tool);
}

function toFinding(check: McpToolName, response: ToolResponse): CheckFinding {
  return {
    check,
    outcome: response.status,
    reasonCode: response.reasonCode,
    confidence: response.confidence,
    evidence: response.evidence,
    providerReference: response.providerReference,
    // Internal wording. Rendered to a reviewer, never to the customer.
    detail: response.reasonCode
      ? `${response.status} (${response.reasonCode})`
      : response.status,
  };
}

/**
 * Read every uploaded document.
 *
 * Extraction runs first because the later checks are only meaningful against
 * what the evidence actually says — the address check compares the
 * application to the address printed on the bill, not to itself.
 */
export function extractDocuments(
  pack: IndustryPack,
  context: { caseId: string; correlationId: string },
  documentCodes: readonly string[],
): CheckFinding[] {
  return documentCodes.map((documentCode) =>
    toFinding(
      "extract_document",
      MCP_HANDLERS.extract_document({
        correlationId: context.correlationId,
        industryCode: pack.industryCode,
        journeyCode: pack.journeyCode,
        caseId: context.caseId,
        idempotencyKey: `${context.caseId}:extract:${documentCode}`,
        schemaVersion: "1.0",
        payload: { documentCode },
      }),
    ),
  );
}

/** Run this journey's external checks and return what each provider reported. */
export function runChecks(
  pack: IndustryPack,
  context: { caseId: string; correlationId: string },
): CheckFinding[] {
  return plannedChecks(pack).map((check) =>
    toFinding(
      check,
      MCP_HANDLERS[check]({
        correlationId: context.correlationId,
        industryCode: pack.industryCode,
        journeyCode: pack.journeyCode,
        caseId: context.caseId,
        idempotencyKey: `${context.caseId}:${check}`,
        schemaVersion: "1.0",
        payload: {},
      }),
    ),
  );
}

/**
 * The one finding a customer can resolve themselves.
 *
 * An address that disagrees with the evidence is a correctable mistake: the
 * customer supplies a better document and the journey continues. A screening
 * hit is not — that needs a reviewer, and asking the customer to fix it would
 * be both useless and a disclosure.
 */
export function customerCorrectable(findings: CheckFinding[]): CheckFinding | undefined {
  return findings.find(
    (finding) =>
      finding.check === "validate_address" && finding.outcome === "MISMATCH",
  );
}

/**
 * A commercial change the customer has to agree to.
 *
 * Serviceability reporting less than was ordered must not be applied silently:
 * the customer bought 1 Gbps, and only they can accept 500 Mbps instead.
 */
export function needsCustomerChoice(
  findings: CheckFinding[],
): CheckFinding | undefined {
  return findings.find(
    (finding) =>
      finding.check === "check_serviceability" && finding.outcome === "PARTIAL",
  );
}
