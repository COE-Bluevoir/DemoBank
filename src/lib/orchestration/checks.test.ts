// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { getIndustryPack } from "@/lib/industry/registry";
import { resetToolAttempts } from "@/lib/mcp/tools";
import {
  customerCorrectable,
  needsCustomerChoice,
  runChecks,
} from "@/lib/orchestration/checks";

/**
 * The storylines, run through the check sequence rather than asserted against
 * fixtures directly. This is what proves each industry runs its own checks and
 * reaches its own finding.
 */

const context = { caseId: "CASE-1", correlationId: "corr-1" };

beforeEach(() => {
  resetToolAttempts();
});

describe("banking", () => {
  const pack = getIndustryPack("banking");

  it("screens the representative and finds the PEP match", () => {
    const screening = runChecks(pack, context).find(
      (finding) => finding.check === "screen_party",
    );

    expect(screening?.outcome).toBe("REVIEW");
    expect(screening?.confidence).toBe(0.72);
  });

  it("finds the address on the bill disagrees, and lets the customer fix it", () => {
    const findings = runChecks(pack, context);
    const correctable = customerCorrectable(findings);

    expect(correctable?.outcome).toBe("MISMATCH");
    // The customer supplies the corrected bill; the second run agrees.
    expect(customerCorrectable(runChecks(pack, context))).toBeUndefined();
  });

  it("does not ask a bank account whether the site can be served", () => {
    expect(
      runChecks(pack, context).some(
        (finding) => finding.check === "check_serviceability",
      ),
    ).toBe(false);
  });
});

describe("insurance", () => {
  const pack = getIndustryPack("insurance");

  it("returns the underwriting score for the sprinkler contradiction", () => {
    const risk = runChecks(pack, context).find(
      (finding) => finding.check === "evaluate_external_risk",
    );

    expect(risk?.outcome).toBe("REVIEW");
    expect(risk?.reasonCode).toBe("SPRINKLER_DATA_CONFLICT");
    expect(risk?.evidence?.score).toBe(68);
  });

  it("has nothing the customer can correct — this needs an underwriter", () => {
    // A contradiction between two documents the customer already supplied is
    // not something they can resolve by uploading a third.
    expect(customerCorrectable(runChecks(pack, context))).toBeUndefined();
  });
});

describe("telecom", () => {
  const pack = getIndustryPack("telecom");

  it("reports only 500 Mbps available and asks the customer to choose", () => {
    const choice = needsCustomerChoice(runChecks(pack, context));

    expect(choice?.outcome).toBe("PARTIAL");
    expect(choice?.evidence?.requestedMbps).toBe(1000);
    expect(choice?.evidence?.availableMbps).toBe(500);
  });

  it("never silently downgrades the order", () => {
    // The tool reports the constraint. Nothing in the check layer applies it —
    // changing what a customer bought is their decision, not a provider's.
    const findings = runChecks(getIndustryPack("telecom"), context);
    const serviceability = findings.find(
      (finding) => finding.check === "check_serviceability",
    );

    expect(serviceability?.outcome).not.toBe("AVAILABLE");
    expect(serviceability?.evidence?.alternatives).toBeTruthy();
  });
});

describe("the check layer stays out of the decision", () => {
  it("reports findings, never outcomes", () => {
    for (const industry of ["banking", "insurance", "telecom"] as const) {
      resetToolAttempts();

      for (const finding of runChecks(getIndustryPack(industry), context)) {
        expect(["APPROVED", "DECLINED", "REJECTED"]).not.toContain(
          finding.outcome,
        );
        // Every finding carries the provider that produced it, so a reviewer
        // can see where a material claim came from.
        expect(finding.providerReference).toBeTruthy();
      }
    }
  });
});
