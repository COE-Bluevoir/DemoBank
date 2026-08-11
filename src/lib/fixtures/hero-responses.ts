import type { McpToolName } from "@/lib/mcp/envelope";
import type { IndustryCode } from "@/lib/industry/types";

/**
 * Canonical provider responses for the three hero storylines.
 *
 * Deterministic on purpose. A demo whose screening result varies between runs
 * cannot demonstrate that a threshold routed a case to a human — the audience
 * has no way to tell a rule from a coincidence.
 *
 * Each entry is what the provider reports. None of them says what should
 * happen next; that is the workflow's decision, and keeping it out of here is
 * what makes the comparison between the two orchestrations meaningful.
 */

export interface HeroResponse {
  status: string;
  reasonCode?: string;
  confidence?: number;
  score?: number;
  evidence?: Record<string, unknown>;
}

/**
 * Some tools are called twice in a storyline and must answer differently the
 * second time — the banking address check fails, the customer corrects it, and
 * the re-check passes. `attempt` is the call number for that tool on that case.
 */
type ByAttempt = readonly HeroResponse[];

type ToolFixtures = Partial<Record<McpToolName, ByAttempt>>;

const BANKING: ToolFixtures = {
  verify_entity: [
    {
      status: "VERIFIED",
      evidence: {
        registeredName: "Sunspire Retail Private Limited",
        registrationNumber: "U52399KA2021PTC148275",
        status: "Active",
      },
    },
  ],

  // First call sees the telephone bill's service address, which is a different
  // premises from the registered office. After the customer supplies the
  // corrected bill, the second call agrees.
  validate_address: [
    {
      status: "MISMATCH",
      reasonCode: "ADDRESS_EVIDENCE_MISMATCH",
      confidence: 0.94,
      evidence: {
        submitted: "2nd Floor, 14 MG Road, Bengaluru, Karnataka 560001",
        fromEvidence:
          "201, 4th Cross, Peenya Industrial Area, Bengaluru, Karnataka 560058",
        similarity: 0.41,
        differingComponents: ["postalCode", "locality"],
      },
    },
    {
      status: "VALID",
      confidence: 0.97,
      evidence: {
        submitted: "2nd Floor, 14 MG Road, Bengaluru, Karnataka 560001",
        fromEvidence: "2nd Floor, 14 MG Road, Bengaluru, Karnataka 560001",
        similarity: 0.99,
      },
    },
  ],

  check_duplicate: [{ status: "NO_MATCH" }],

  // The finding the banking storyline turns on. 0.72 is below certainty and
  // above nothing — exactly the band where a threshold, not a model, should
  // decide that a person looks at it.
  screen_party: [
    {
      status: "REVIEW",
      reasonCode: "POTENTIAL_PEP_NAME_MATCH",
      confidence: 0.72,
      evidence: {
        matchedName: "Arjun Mehta",
        candidateName: "Arjun Mehta",
        candidateDateOfBirth: "02/11/1968",
        candidateCountry: "Singapore",
        listSource: "TEST-PEP-LIST",
        note: "Name matches; date of birth and country do not.",
      },
    },
  ],

  evaluate_external_risk: [
    { status: "PASS", score: 31, reasonCode: "KYC_RISK_WITHIN_APPETITE" },
  ],

  create_customer: [
    { status: "SUCCESS", evidence: { externalCustomerIdentifier: "CIF-TEST-10001" } },
  ],

  activate_service: [
    {
      status: "SUCCESS",
      evidence: {
        externalServiceIdentifier: "ACC-TEST-20001",
        onlineBanking: "ACTIVE",
      },
    },
  ],

  send_notification: [
    { status: "SENT", evidence: { messageReference: "MSG-TEST-30001" } },
  ],
};

const INSURANCE: ToolFixtures = {
  verify_entity: [
    {
      status: "VERIFIED",
      evidence: {
        registeredName: "Sunspire Retail Private Limited",
        registrationNumber: "U52399KA2021PTC148275",
        status: "Active",
      },
    },
  ],

  screen_party: [{ status: "CLEAR" }],

  // The underwriting signal reflects the contradiction the document agent
  // found between the proposal and the surveyor's questionnaire.
  evaluate_external_risk: [
    {
      status: "REVIEW",
      score: 68,
      reasonCode: "SPRINKLER_DATA_CONFLICT",
      evidence: {
        proposalStates: "Sprinklers Installed - YES",
        questionnaireStates: "Sprinklers Installed - NO",
        sourceDocuments: ["PROPOSAL_FORM", "RISK_QUESTIONNAIRE"],
        riskLocation: "No. 22, Hosur Main Road, Bengaluru, Karnataka 560029",
      },
    },
  ],

  create_customer: [
    {
      status: "SUCCESS",
      evidence: { externalCustomerIdentifier: "INS-CUST-TEST-10001" },
    },
  ],

  activate_service: [
    {
      status: "SUCCESS",
      evidence: {
        externalServiceIdentifier: "POL-TEST-2026-0001",
        policyStatus: "Issued",
      },
    },
  ],

  send_notification: [
    { status: "SENT", evidence: { messageReference: "MSG-TEST-30002" } },
  ],
};

const TELECOM: ToolFixtures = {
  verify_entity: [
    {
      status: "VERIFIED",
      evidence: {
        registeredName: "Sunspire Retail Private Limited",
        registrationNumber: "U52399KA2021PTC148275",
        status: "Active",
      },
    },
  ],

  validate_address: [
    {
      status: "VALID",
      confidence: 0.96,
      evidence: {
        site: "Plot 8, Electronic City Phase 1, Bengaluru, Karnataka 560100",
        similarity: 0.98,
      },
    },
  ],

  check_duplicate: [{ status: "NO_MATCH" }],

  // The order asks for 1 Gbps; the local access network can offer 500 Mbps.
  // The tool reports the constraint and the alternative. It does not amend
  // the order — a commercial change needs the customer's agreement.
  check_serviceability: [
    {
      status: "PARTIAL",
      reasonCode: "ACCESS_CAPACITY_LIMIT",
      evidence: {
        site: "Plot 8, Electronic City Phase 1, Bengaluru, Karnataka 560100",
        requestedMbps: 1000,
        availableMbps: 500,
        alternatives: [
          { productCode: "DEDICATED_INTERNET_500", bandwidthMbps: 500 },
        ],
        earliestUpgrade: "2027-03-01",
      },
    },
  ],

  evaluate_external_risk: [
    { status: "PASS", score: 22, reasonCode: "CONTRACT_RISK_ACCEPTABLE" },
  ],

  create_customer: [
    {
      status: "SUCCESS",
      evidence: { externalCustomerIdentifier: "TEL-CUST-TEST-10001" },
    },
  ],

  activate_service: [
    {
      status: "SUCCESS",
      evidence: {
        externalServiceIdentifier: "SUB-TEST-50001",
        billingReference: "BILL-TEST-60001",
        provisionedMbps: 500,
      },
    },
  ],

  send_notification: [
    { status: "SENT", evidence: { messageReference: "MSG-TEST-30003" } },
  ],
};

const BY_INDUSTRY: Record<IndustryCode, ToolFixtures> = {
  BANKING: BANKING,
  INSURANCE: INSURANCE,
  TELECOM: TELECOM,
};

/**
 * The hero response for a tool, on a given attempt.
 *
 * Attempts beyond those declared repeat the last one: a provider asked the
 * same question a third time gives the same answer, rather than running out
 * of fixture and inventing something.
 */
export function heroResponse(
  industryCode: IndustryCode,
  tool: McpToolName,
  attempt = 1,
): HeroResponse | undefined {
  const responses = BY_INDUSTRY[industryCode]?.[tool];

  if (!responses || responses.length === 0) {
    return undefined;
  }

  return responses[Math.min(attempt, responses.length) - 1];
}
