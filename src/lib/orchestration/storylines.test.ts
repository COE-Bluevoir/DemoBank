// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CONSENT_VERSION } from "@/lib/onboarding/constants";
import { getIndustryPack } from "@/lib/industry/registry";
import { resetToolAttempts } from "@/lib/mcp/tools";
import {
  InMemoryNonPegaCaseStore,
  setNonPegaCaseStore,
} from "@/lib/orchestration/case-store";
import { NonPegaOrchestrationAdapter } from "@/lib/orchestration/non-pega-adapter";
import type { IndustryId } from "@/lib/industry/types";

/**
 * The demo storylines, driven through the orchestration itself.
 *
 * The check layer is tested separately; this asserts the thing the audience
 * actually sees — that a journey reaches the outcome the storyline promises,
 * and stops where a person is supposed to intervene.
 *
 * Nothing here needs AWS. The deterministic provider and the fixture services
 * carry the whole journey, so the demo runs on a laptop with no credentials.
 */

const APPLICANT = {
  firstName: "Arjun",
  lastName: "Mehta",
  dateOfBirth: "1991-08-14",
  nationality: "Indian",
  mobile: "+91 98765 43210",
  email: "arjun.mehta@sunspire.in",
  addressLine1: "2nd Floor, 14 MG Road",
  city: "Bengaluru",
  region: "Karnataka",
  postalCode: "560001",
  country: "India",
  employmentStatus: "Salaried",
  incomeRange: "INR 10-15 lakh per annum",
  taxResidency: "India",
};

async function openCase(industryId: IndustryId) {
  const adapter = new NonPegaOrchestrationAdapter();

  const created = await adapter.createCase({
    productCode: "EVERYDAY_PLUS",
    channel: "WEB",
    scenarioId: "ADDRESS_PEP_REVIEW",
    industryId,
  });

  const begun = await adapter.submitAction(created.caseId, {
    actionId: "BEGIN_APPLICATION",
    expectedCaseVersion: created.caseVersion,
  });

  const detailed = await adapter.submitAction(created.caseId, {
    actionId: "SUBMIT_DETAILS",
    expectedCaseVersion: begun.caseVersion,
    data: { ...APPLICANT },
  });

  const consented = await adapter.submitAction(created.caseId, {
    actionId: "ACCEPT_CONSENT",
    expectedCaseVersion: detailed.caseVersion,
    data: {
      accepted: true,
      timestamp: new Date().toISOString(),
      textVersion: CONSENT_VERSION,
      channel: "WEB",
    },
  });

  return { adapter, caseId: created.caseId, view: consented };
}

/** Hand over every document this industry asks for. */
async function uploadEvidence(
  adapter: NonPegaOrchestrationAdapter,
  caseId: string,
  industryId: IndustryId,
) {
  for (const requirement of getIndustryPack(industryId).documentProfile) {
    await adapter.uploadDocument(caseId, {
      kind: requirement.kind,
      documentCode: requirement.code,
      fileName: `${requirement.code}.png`,
      fileType: "image/png",
      fileSize: 1024,
      source: "demo",
    });
  }

  return adapter.getCase(caseId);
}

beforeEach(() => {
  setNonPegaCaseStore(new InMemoryNonPegaCaseStore());
  resetToolAttempts();
});

afterEach(() => {
  setNonPegaCaseStore(undefined);
});

describe("banking storyline", () => {
  it("holds the case for a reviewer rather than deciding the PEP match itself", async () => {
    const { adapter, caseId, view } = await openCase("banking");
    expect(view.status).toBe("DOCUMENTS_REQUIRED");

    const afterEvidence = await uploadEvidence(adapter, caseId, "banking");

    // A possible PEP match at 0.72 is exactly the band where a threshold, not
    // a model, decides that a person looks at it.
    expect(afterEvidence.status).toBe("ROUTINE_REVIEW");
  });

  it("opens the account only after a reviewer clears it", async () => {
    const { adapter, caseId } = await openCase("banking");
    await uploadEvidence(adapter, caseId, "banking");

    const cleared = await adapter.submitAction(caseId, {
      actionId: "CLEAR_REVIEW",
      expectedCaseVersion: (await adapter.getCase(caseId)).caseVersion,
    });

    expect(cleared.status).toBe("COMPLETED");
    expect(cleared.outcome?.customerReference).toBeTruthy();
  });

  it("records who decided what", async () => {
    const { adapter, caseId } = await openCase("banking");
    await uploadEvidence(adapter, caseId, "banking");

    const categories = (await adapter.getEvents(caseId)).map(
      (event) => event.category,
    );

    // Evidence from tools, the decision from a rule, the case from the
    // customer — a ledger that cannot distinguish them proves nothing.
    expect(categories).toContain("TOOL");
    expect(categories).toContain("RULE");
    expect(categories).toContain("HUMAN");
  });
});

describe("telecom storyline", () => {
  it("stops and asks the customer before changing what they ordered", async () => {
    const { adapter, caseId } = await openCase("telecom");
    const afterEvidence = await uploadEvidence(adapter, caseId, "telecom");

    // 1 Gbps was ordered and only 500 Mbps can be delivered. Provisioning the
    // lesser service without asking would be the failure this test guards.
    expect(afterEvidence.status).toBe("ADDRESS_CONFIRMATION_REQUIRED");
    expect(afterEvidence.outcome).toBeUndefined();
  });

  it("continues once the customer accepts the alternative", async () => {
    const { adapter, caseId } = await openCase("telecom");
    await uploadEvidence(adapter, caseId, "telecom");

    const accepted = await adapter.submitAction(caseId, {
      actionId: "ACCEPT_ALTERNATIVE",
      expectedCaseVersion: (await adapter.getCase(caseId)).caseVersion,
    });

    expect(accepted.status).not.toBe("ADDRESS_CONFIRMATION_REQUIRED");

    const events = await adapter.getEvents(caseId);
    expect(
      events.some((event) => event.displayName === "Alternative accepted"),
    ).toBe(true);
  });
});

describe("insurance storyline", () => {
  it("routes the sprinkler contradiction to a human", async () => {
    const { adapter, caseId } = await openCase("insurance");
    const afterEvidence = await uploadEvidence(adapter, caseId, "insurance");

    // The customer cannot resolve two documents they already supplied
    // disagreeing with each other; an underwriter has to.
    expect(afterEvidence.status).toBe("ROUTINE_REVIEW");
  });

  it("issues the policy once the underwriter approves", async () => {
    const { adapter, caseId } = await openCase("insurance");
    await uploadEvidence(adapter, caseId, "insurance");

    const approved = await adapter.submitAction(caseId, {
      actionId: "CLEAR_REVIEW",
      expectedCaseVersion: (await adapter.getCase(caseId)).caseVersion,
      data: { reviewedBy: "underwriter" },
    });

    expect(approved.status).toBe("COMPLETED");
  });
});

describe("multi-document journeys", () => {
  it("keeps every document, not just one per evidence class", async () => {
    // Banking asks for four documents and three of them are identity
    // evidence. Keying storage by class would silently discard two.
    const { adapter, caseId } = await openCase("banking");
    const view = await uploadEvidence(adapter, caseId, "banking");

    const profile = getIndustryPack("banking").documentProfile;
    expect(view.documents).toHaveLength(profile.length);
    expect(new Set(view.documents?.map((item) => item.documentCode)).size).toBe(
      profile.length,
    );
  });

  it("replaces a re-uploaded document rather than duplicating it", async () => {
    const { adapter, caseId } = await openCase("banking");
    await uploadEvidence(adapter, caseId, "banking");

    // The correction loop: the customer supplies a better address proof.
    await adapter.uploadDocument(caseId, {
      kind: "ADDRESS",
      documentCode: "ADDRESS_PROOF",
      fileName: "corrected-bill.png",
      fileType: "image/png",
      fileSize: 2048,
      source: "upload",
    });

    const view = await adapter.getCase(caseId);
    const addressProofs = view.documents?.filter(
      (item) => item.documentCode === "ADDRESS_PROOF",
    );

    expect(addressProofs).toHaveLength(1);
    expect(addressProofs?.[0]?.fileName).toBe("corrected-bill.png");
  });
});

describe("what the customer is never shown", () => {
  it("keeps screening vocabulary out of the customer-facing case", async () => {
    const { adapter, caseId } = await openCase("banking");
    await uploadEvidence(adapter, caseId, "banking");

    const view = JSON.stringify(await adapter.getCase(caseId));

    expect(view).not.toMatch(/\bPEP\b|sanction|watchlist|HARD_STOP/i);
  });
});
