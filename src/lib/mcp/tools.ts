import { EXPECTED_EXTRACTIONS } from "@/lib/fixtures/expected-extraction";
import { heroResponse } from "@/lib/fixtures/hero-responses";
import {
  type McpToolName,
  type ToolRequest,
  type ToolResponse,
  type ToolStatus,
  toolResponse,
} from "@/lib/mcp/envelope";

/**
 * Mock Enterprise Services.
 *
 * Stands in for the systems a real onboarding would call: a company registry,
 * a screening provider, a core banking platform, a policy administration
 * system, a provisioning platform.
 *
 * The boundary these observe, without exception: they return findings, and
 * never decide. There is no code path here that can approve an application,
 * choose a stage, mandate a human review, or authorise activation. That is
 * what makes the comparison between orchestrations honest — if the test
 * double could decide, both orchestrations would look identical.
 */

/** How many times a tool has been called for a case, so replays differ. */
const attempts = new Map<string, number>();

function nextAttempt(caseId: string, tool: McpToolName): number {
  const key = `${caseId}:${tool}`;
  const attempt = (attempts.get(key) ?? 0) + 1;
  attempts.set(key, attempt);
  return attempt;
}

/** Test seam: forget how many times each tool has been called. */
export function resetToolAttempts(): void {
  attempts.clear();
}

/**
 * Read a fixture and shape it into the response envelope.
 *
 * Every tool that has a hero fixture goes through here, so the storylines are
 * driven by the fixture file rather than by logic scattered across ten
 * handlers.
 */
function fromHero(
  request: ToolRequest,
  tool: McpToolName,
  fallback: ToolStatus,
  referencePrefix: string,
): ToolResponse {
  const attempt = nextAttempt(request.caseId, tool);
  const hero = heroResponse(request.industryCode, tool, attempt);

  if (!hero) {
    return toolResponse(fallback, `${referencePrefix}-${attempt}`);
  }

  return toolResponse(hero.status as ToolStatus, `${referencePrefix}-${attempt}`, {
    reasonCode: hero.reasonCode,
    confidence: hero.confidence,
    evidence: {
      ...hero.evidence,
      ...(hero.score === undefined ? {} : { score: hero.score }),
    },
  });
}

/**
 * Return the structured content of a supplied document.
 *
 * Reads the ground-truth fixture rather than running OCR. The point of the
 * test pack is that extraction output can be compared against a known answer;
 * a real extractor can be swapped in behind this same contract and measured
 * against the same fixture.
 */
export function extractDocument(request: ToolRequest): ToolResponse {
  const documentCode = String(request.payload.documentCode ?? "");
  const expected = EXPECTED_EXTRACTIONS[documentCode];
  const attempt = nextAttempt(request.caseId, "extract_document");

  if (!expected) {
    // An unrecognised category is a partial extraction, not a failure: the
    // file exists, we simply have no ground truth to compare it against.
    return toolResponse("PARTIAL", `DOC-TEST-${attempt}`, {
      reasonCode: "UNKNOWN_DOCUMENT_CODE",
      evidence: { documentCode },
    });
  }

  return toolResponse("SUCCESS", `DOC-TEST-${attempt}`, {
    confidence: expected.overallConfidence,
    evidence: {
      documentCode,
      label: expected.label,
      fields: expected.fields,
      fieldConfidence: expected.fieldConfidence,
      documentRef: request.payload.documentRef,
    },
  });
}

export function verifyEntity(request: ToolRequest): ToolResponse {
  return fromHero(request, "verify_entity", "VERIFIED", "REG-TEST");
}

export function checkDuplicate(request: ToolRequest): ToolResponse {
  return fromHero(request, "check_duplicate", "NO_MATCH", "DUP-TEST");
}

/**
 * Sanctions, PEP and watchlist screening.
 *
 * Returns the finding and the evidence behind it — including the details that
 * do *not* match, because that is what lets a reviewer clear a false positive
 * rather than take the score on trust.
 */
export function screenParty(request: ToolRequest): ToolResponse {
  return fromHero(request, "screen_party", "CLEAR", "SCR-TEST");
}

export function validateAddress(request: ToolRequest): ToolResponse {
  return fromHero(request, "validate_address", "VALID", "ADR-TEST");
}

export function evaluateExternalRisk(request: ToolRequest): ToolResponse {
  return fromHero(request, "evaluate_external_risk", "PASS", "RSK-TEST");
}

/**
 * Whether the requested service can be delivered at a site.
 *
 * Reports what is available. It does not amend the order to fit: changing what
 * a customer bought is a commercial decision, and the workflow has to put that
 * choice back to them.
 */
export function checkServiceability(request: ToolRequest): ToolResponse {
  return fromHero(request, "check_serviceability", "AVAILABLE", "SVC-TEST");
}

export function createCustomer(request: ToolRequest): ToolResponse {
  return fromHero(request, "create_customer", "SUCCESS", "CUS-TEST");
}

export function activateService(request: ToolRequest): ToolResponse {
  return fromHero(request, "activate_service", "SUCCESS", "ACT-TEST");
}

export function sendNotification(request: ToolRequest): ToolResponse {
  return fromHero(request, "send_notification", "SENT", "MSG-TEST");
}

export const MCP_HANDLERS: Record<
  McpToolName,
  (request: ToolRequest) => ToolResponse
> = {
  extract_document: extractDocument,
  verify_entity: verifyEntity,
  check_duplicate: checkDuplicate,
  screen_party: screenParty,
  validate_address: validateAddress,
  evaluate_external_risk: evaluateExternalRisk,
  check_serviceability: checkServiceability,
  create_customer: createCustomer,
  activate_service: activateService,
  send_notification: sendNotification,
};
