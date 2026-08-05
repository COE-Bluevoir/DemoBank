// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import type { AgentDecisionRecord } from "@/lib/agents/contracts";
import { reviewDocuments, reviewScreening } from "@/lib/agents/specialists";
import { DirectToolInvoker, ToolInvocationError } from "@/lib/agents/tools";
import { getIndustryPack } from "@/lib/industry/registry";
import {
  DEMO_CUSTOMER,
  DOCUMENT_MISMATCH_ADDRESS,
} from "@/lib/onboarding/constants";
import { resetIdempotencyStore } from "@/lib/services/idempotency";

const pack = getIndustryPack("banking");
const invoker = new DirectToolInvoker();

const applicationAddress = {
  addressLine1: DEMO_CUSTOMER.addressLine1,
  city: DEMO_CUSTOMER.city,
  region: DEMO_CUSTOMER.region,
  postalCode: DEMO_CUSTOMER.postalCode,
  country: DEMO_CUSTOMER.country,
};

function context(records: AgentDecisionRecord[] = []) {
  return {
    caseId: "ONB-10027",
    correlationId: "corr-test",
    pack,
    invoker,
    records,
  };
}

beforeEach(() => {
  resetIdempotencyStore();
});

describe("tool invoker", () => {
  it("refuses a tool that is not on the allowlist", async () => {
    await expect(
      invoker.invoke({ tool: "drop-database", input: {} }),
    ).rejects.toBeInstanceOf(ToolInvocationError);
  });

  it("refuses input that does not match the tool contract", async () => {
    await expect(
      invoker.invoke({ tool: "screen-pep", input: { caseId: "ONB-1" } }),
    ).rejects.toBeInstanceOf(ToolInvocationError);
  });

  it("requires an idempotency key for a tool with a side effect", async () => {
    await expect(
      invoker.invoke({
        tool: "create-customer",
        input: {
          caseId: "ONB-1",
          productCode: "EVERYDAY_PLUS",
          applicant: {
            fullName: "Ananya Rao",
            dateOfBirth: "1992-08-14",
            email: "a@example.test",
            mobile: "+91 90000 00000",
            address: applicationAddress,
          },
        },
      }),
    ).rejects.toThrow(/idempotency key/i);
  });

  it("replays a stored result rather than repeating a side effect", async () => {
    const input = {
      caseId: "ONB-1",
      productCode: "EVERYDAY_PLUS",
      applicant: {
        fullName: "Ananya Rao",
        dateOfBirth: "1992-08-14",
        email: "a@example.test",
        mobile: "+91 90000 00000",
        address: applicationAddress,
      },
    };

    const first = await invoker.invoke({
      tool: "create-customer",
      input,
      idempotencyKey: "key-1",
    });
    const second = await invoker.invoke({
      tool: "create-customer",
      input,
      idempotencyKey: "key-1",
    });

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.output).toEqual(first.output);
  });
});

describe("document specialist", () => {
  it("reports the scripted address mismatch as correctable", async () => {
    const records: AgentDecisionRecord[] = [];

    const finding = await reviewDocuments(context(records), {
      fullName: "Ananya Rao",
      address: applicationAddress,
      identityStorageReference: "ref-identity",
      addressStorageReference: "ref-address",
    });

    const addressDiscrepancy = finding.discrepancies.find(
      (item) => item.field === "addressLine1",
    );

    expect(addressDiscrepancy?.documentValue).toBe(DOCUMENT_MISMATCH_ADDRESS);
    expect(addressDiscrepancy?.suggestedClassification).toBe("CORRECTABLE");
    expect(records[0].actor).toBe("document");
  });

  it("flags a name that does not match the identity document as material", async () => {
    const finding = await reviewDocuments(context(), {
      fullName: "Someone Else",
      address: applicationAddress,
      identityStorageReference: "ref-identity",
      addressStorageReference: "ref-address",
    });

    const nameDiscrepancy = finding.discrepancies.find(
      (item) => item.field === "fullName",
    );

    expect(nameDiscrepancy?.suggestedClassification).toBe("MATERIAL");
  });

  it("describes discrepancies without deciding the outcome", async () => {
    const finding = await reviewDocuments(context(), {
      fullName: "Ananya Rao",
      address: applicationAddress,
      identityStorageReference: "ref-identity",
      addressStorageReference: "ref-address",
    });

    // A verdict field would mean the agent had adjudicated, which is the
    // workflow's job.
    expect(finding).not.toHaveProperty("decision");
    expect(finding).not.toHaveProperty("approved");
    expect(finding.confidence).toBeGreaterThan(0);
  });

  it("records which tools it invoked", async () => {
    const finding = await reviewDocuments(context(), {
      fullName: "Ananya Rao",
      address: applicationAddress,
      identityStorageReference: "ref-identity",
      addressStorageReference: "ref-address",
    });

    expect(finding.toolsInvoked).toEqual([
      "extract-identity",
      "extract-address",
      "validate-address",
    ]);
  });
});

describe("screening specialist", () => {
  const applicant = {
    fullName: "Ananya Rao",
    dateOfBirth: DEMO_CUSTOMER.dateOfBirth,
    nationality: DEMO_CUSTOMER.nationality,
    email: DEMO_CUSTOMER.email,
    mobile: DEMO_CUSTOMER.mobile,
    postalCode: DEMO_CUSTOMER.postalCode,
  };

  it("runs every registered check including the credit bureau", async () => {
    const finding = await reviewScreening(context(), applicant);

    expect(finding.toolsInvoked).toEqual([
      "screen-sanctions",
      "screen-pep",
      "check-duplicate",
      "check-credit-bureau",
    ]);
  });

  it("escalates the scripted PEP hit instead of clearing it", async () => {
    const finding = await reviewScreening(context(), applicant);

    const pep = finding.results.find((item) => item.check === "screen-pep");

    expect(pep?.outcome).toBe("POTENTIAL_MATCH");
    expect(finding.requiresHumanReview).toBe(true);
  });

  it("does not escalate when every check is clear", async () => {
    const finding = await reviewScreening(context(), {
      ...applicant,
      fullName: "Someone Unremarkable",
    });

    expect(finding.requiresHumanReview).toBe(false);
  });

  it("reports a score band rather than a lending decision", async () => {
    const finding = await reviewScreening(context(), applicant);
    const bureau = finding.results.find(
      (item) => item.check === "check-credit-bureau",
    );

    expect(bureau?.detail).toMatch(
      /EXCELLENT|GOOD|FAIR|POOR|NO_HISTORY/,
    );
    expect(JSON.stringify(finding)).not.toMatch(/approved|declined|rejected/i);
  });

  it("records the review for audit", async () => {
    const records: AgentDecisionRecord[] = [];
    await reviewScreening(context(records), applicant);

    expect(records[0].actor).toBe("screening");
    expect(records[0].correlationId).toBe("corr-test");
    expect(records[0].outcome).toBe("succeeded");
  });
});
