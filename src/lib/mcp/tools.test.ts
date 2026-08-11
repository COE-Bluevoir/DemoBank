// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { MCP_TOOLS, type ToolRequest } from "@/lib/mcp/envelope";
import { MCP_HANDLERS, resetToolAttempts } from "@/lib/mcp/tools";

/**
 * The three storylines are the demo. If a fixture drifts, the demo stops
 * demonstrating what it claims — a threshold routing a case to a human only
 * means something if the score is reliably 0.72.
 */

function request(overrides: Partial<ToolRequest> = {}): ToolRequest {
  return {
    correlationId: "corr-test",
    industryCode: "BANKING",
    journeyCode: "BUSINESS_CURRENT_ACCOUNT",
    caseId: "CASE-1",
    idempotencyKey: "key-1",
    schemaVersion: "1.0",
    payload: {},
    ...overrides,
  };
}

beforeEach(() => {
  resetToolAttempts();
});

describe("banking storyline", () => {
  it("reports the address on the telephone bill as a mismatch, then agrees once corrected", () => {
    const first = MCP_HANDLERS.validate_address(request());
    expect(first.status).toBe("MISMATCH");
    expect(first.reasonCode).toBe("ADDRESS_EVIDENCE_MISMATCH");

    // The customer supplies the corrected bill and the check is re-run.
    const second = MCP_HANDLERS.validate_address(request());
    expect(second.status).toBe("VALID");
  });

  it("returns a PEP finding at the confidence the storyline turns on", () => {
    const result = MCP_HANDLERS.screen_party(request());

    expect(result.status).toBe("REVIEW");
    expect(result.reasonCode).toBe("POTENTIAL_PEP_NAME_MATCH");
    expect(result.confidence).toBe(0.72);
  });

  it("gives the reviewer what they need to clear a false positive", () => {
    // A score alone cannot be cleared responsibly. The details that fail to
    // match are what make the finding reviewable.
    const evidence = MCP_HANDLERS.screen_party(request()).evidence ?? {};

    expect(evidence.candidateDateOfBirth).toBeTruthy();
    expect(evidence.candidateCountry).toBeTruthy();
    expect(evidence.listSource).toBeTruthy();
  });

  it("returns the customer and account references the storyline expects", () => {
    expect(
      MCP_HANDLERS.create_customer(request()).evidence?.externalCustomerIdentifier,
    ).toBe("CIF-TEST-10001");
    expect(
      MCP_HANDLERS.activate_service(request()).evidence?.externalServiceIdentifier,
    ).toBe("ACC-TEST-20001");
  });
});

describe("insurance storyline", () => {
  const insurance = () =>
    request({
      industryCode: "INSURANCE",
      journeyCode: "COMMERCIAL_PROPERTY_POLICY",
    });

  it("scores the sprinkler contradiction for review, citing both documents", () => {
    const result = MCP_HANDLERS.evaluate_external_risk(insurance());

    expect(result.status).toBe("REVIEW");
    expect(result.reasonCode).toBe("SPRINKLER_DATA_CONFLICT");
    expect(result.evidence?.score).toBe(68);
    expect(result.evidence?.sourceDocuments).toEqual([
      "PROPOSAL_FORM",
      "RISK_QUESTIONNAIRE",
    ]);
  });

  it("issues the policy number the storyline expects", () => {
    expect(
      MCP_HANDLERS.activate_service(insurance()).evidence
        ?.externalServiceIdentifier,
    ).toBe("POL-TEST-2026-0001");
  });
});

describe("telecom storyline", () => {
  const telecom = () =>
    request({
      industryCode: "TELECOM",
      journeyCode: "BUSINESS_CONNECTIVITY",
    });

  it("offers 500 Mbps against a 1 Gbps order rather than silently downgrading", () => {
    const result = MCP_HANDLERS.check_serviceability(telecom());

    expect(result.status).toBe("PARTIAL");
    expect(result.evidence?.requestedMbps).toBe(1000);
    expect(result.evidence?.availableMbps).toBe(500);
    expect(result.evidence?.alternatives).toBeTruthy();
  });

  it("returns both the subscription and the billing reference", () => {
    const evidence = MCP_HANDLERS.activate_service(telecom()).evidence ?? {};

    expect(evidence.externalServiceIdentifier).toBe("SUB-TEST-50001");
    expect(evidence.billingReference).toBe("BILL-TEST-60001");
  });
});

describe("extraction", () => {
  it("returns the planted address discrepancy from the telephone bill", () => {
    const result = MCP_HANDLERS.extract_document(
      request({ payload: { documentCode: "ADDRESS_PROOF" } }),
    );

    const fields = result.evidence?.fields as Record<string, string>;

    // Both addresses matter: an extraction returning only the billing address
    // would agree with the application and miss the mismatch entirely.
    expect(fields["Billing Address"]).toContain("560001");
    expect(fields["Service Address"]).toContain("560058");
  });

  it("returns the two sides of the sprinkler contradiction", () => {
    const proposal = MCP_HANDLERS.extract_document(
      request({ payload: { documentCode: "PROPOSAL_FORM" } }),
    ).evidence?.fields as Record<string, string>;

    const questionnaire = MCP_HANDLERS.extract_document(
      request({ payload: { documentCode: "RISK_QUESTIONNAIRE" } }),
    ).evidence?.fields as Record<string, string>;

    expect(proposal["Fire Protection System"]).toContain("YES");
    expect(questionnaire["Sprinklers Installed"]).toBe("NO");
  });

  it("reports an unknown category as partial rather than inventing fields", () => {
    const result = MCP_HANDLERS.extract_document(
      request({ payload: { documentCode: "NOT_A_REAL_CODE" } }),
    );

    expect(result.status).toBe("PARTIAL");
    expect(result.reasonCode).toBe("UNKNOWN_DOCUMENT_CODE");
  });

  it("carries confidence per field, not only overall", () => {
    // The test matrix requires confidence to be captured rather than shown:
    // a reviewer needs to know which field the extractor was unsure about.
    const result = MCP_HANDLERS.extract_document(
      request({ payload: { documentCode: "REPRESENTATIVE_ID" } }),
    );

    expect(result.evidence?.fieldConfidence).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0.9);
  });
});

describe("the boundary these services must not cross", () => {
  it("never returns a decision about the case", () => {
    // A test double that could approve, decline or demand review would make
    // both orchestrations look the same, which is the one thing this
    // accelerator exists to distinguish.
    const forbidden = [
      "APPROVED",
      "DECLINED",
      "REJECTED",
      "AUTHORISED",
      "AUTHORIZED",
    ];

    for (const tool of MCP_TOOLS) {
      resetToolAttempts();

      for (const industryCode of ["BANKING", "INSURANCE", "TELECOM"] as const) {
        const result = MCP_HANDLERS[tool](request({ industryCode }));

        expect(forbidden).not.toContain(result.status);
      }
    }
  });

  it("gives every response a provider reference and a timestamp", () => {
    for (const tool of MCP_TOOLS) {
      const result = MCP_HANDLERS[tool](request());

      expect(result.providerReference).toBeTruthy();
      expect(Date.parse(result.timestamp)).not.toBeNaN();
    }
  });
});
