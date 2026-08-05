// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { formatFullName } from "@/lib/onboarding/applicant-name";
import { DEMO_CUSTOMER, DOCUMENT_MISMATCH_ADDRESS } from "@/lib/onboarding/constants";
import {
  extractAddress,
  extractIdentity,
  validateAddress,
  verifyIdentity,
} from "@/lib/services/handlers/extraction";
import {
  createCustomer,
  generateCommunication,
} from "@/lib/services/handlers/fulfilment";
import {
  checkDuplicate,
  screenPep,
  screenSanctions,
} from "@/lib/services/handlers/screening";
import {
  IdempotencyConflictError,
  resetIdempotencyStore,
  runIdempotent,
} from "@/lib/services/idempotency";
import { getToolDefinition, isToolName, listTools } from "@/lib/services/registry";

const applicationAddress = {
  addressLine1: DEMO_CUSTOMER.addressLine1,
  city: DEMO_CUSTOMER.city,
  region: DEMO_CUSTOMER.region,
  postalCode: DEMO_CUSTOMER.postalCode,
  country: DEMO_CUSTOMER.country,
};

beforeEach(() => {
  resetIdempotencyStore();
});

describe("extraction tools", () => {
  it("returns identical output for identical input", () => {
    const request = {
      caseId: "ONB-10027",
      documentId: "DOC-1",
      storageReference: "ref-1",
    };

    expect(extractIdentity(request)).toEqual(extractIdentity(request));
    expect(extractAddress(request)).toEqual(extractAddress(request));
  });

  it("extracts the scripted document address that differs from the application", () => {
    const result = extractAddress({
      caseId: "ONB-10027",
      documentId: "DOC-2",
      storageReference: "ref-2",
    });

    expect(result.address.addressLine1).toBe(DOCUMENT_MISMATCH_ADDRESS);
    expect(result.address.addressLine1).not.toBe(DEMO_CUSTOMER.addressLine1);
  });

  it("passes identity verification for a consistent applicant", () => {
    const result = verifyIdentity({
      caseId: "ONB-10027",
      fullName: formatFullName(DEMO_CUSTOMER),
      dateOfBirth: DEMO_CUSTOMER.dateOfBirth,
      documentNumber: "IDN-123456",
    });

    expect(result.outcome).toBe("PASSED");
    expect(result.reasonCodes).toContain("NAME_MATCH");
  });
});

describe("address validation", () => {
  it("classifies a house-number difference as customer correctable", () => {
    const result = validateAddress({
      caseId: "ONB-10027",
      applicationAddress,
      documentAddress: {
        ...applicationAddress,
        addressLine1: DOCUMENT_MISMATCH_ADDRESS,
      },
    });

    expect(result.outcome).toBe("POTENTIAL_MATCH");
    expect(result.mismatch?.suggestedClassification).toBe("CORRECTABLE");
    expect(result.mismatch?.field).toBe("addressLine1");
  });

  it("classifies a different city as material rather than correctable", () => {
    const result = validateAddress({
      caseId: "ONB-10027",
      applicationAddress,
      documentAddress: { ...applicationAddress, city: "Mumbai" },
    });

    expect(result.mismatch?.suggestedClassification).toBe("MATERIAL");
  });

  it("passes when the addresses differ only by case and spacing", () => {
    const result = validateAddress({
      caseId: "ONB-10027",
      applicationAddress,
      documentAddress: {
        ...applicationAddress,
        addressLine1: `  ${DEMO_CUSTOMER.addressLine1.toUpperCase()}  `,
      },
    });

    expect(result.outcome).toBe("PASSED");
    expect(result.mismatch).toBeUndefined();
  });

  it("passes when no document address was extracted", () => {
    const result = validateAddress({ caseId: "ONB-10027", applicationAddress });

    expect(result.outcome).toBe("PASSED");
    expect(result.reasonCodes).toContain("NO_DOCUMENT_ADDRESS_SUPPLIED");
  });
});

describe("screening tools", () => {
  const request = {
    caseId: "ONB-10027",
    fullName: formatFullName(DEMO_CUSTOMER),
    dateOfBirth: DEMO_CUSTOMER.dateOfBirth,
    nationality: DEMO_CUSTOMER.nationality,
  };

  it("clears sanctions for the scripted applicant", () => {
    const result = screenSanctions(request);

    expect(result.outcome).toBe("CLEAR");
    expect(result.candidates).toHaveLength(0);
    expect(result.listsSearched.length).toBeGreaterThan(0);
  });

  it("reports the scripted PEP hit as a potential match, never auto-cleared", () => {
    const result = screenPep(request);

    expect(result.outcome).toBe("POTENTIAL_MATCH");
    expect(result.matchConfidence).toBeLessThan(0.7);
    expect(result.reasonCodes).toContain("MANUAL_REVIEW_RECOMMENDED");
  });

  it("clears PEP screening for an unrelated applicant", () => {
    const result = screenPep({ ...request, fullName: "Someone Else" });

    expect(result.outcome).toBe("CLEAR");
    expect(result.candidates).toHaveLength(0);
  });

  it("clears the duplicate check", () => {
    const result = checkDuplicate({
      caseId: "ONB-10027",
      fullName: formatFullName(DEMO_CUSTOMER),
      dateOfBirth: DEMO_CUSTOMER.dateOfBirth,
      email: DEMO_CUSTOMER.email,
      mobile: DEMO_CUSTOMER.mobile,
    });

    expect(result.outcome).toBe("CLEAR");
    expect(result.existingCustomerId).toBeUndefined();
  });
});

describe("fulfilment tools", () => {
  const createRequest = {
    caseId: "ONB-10027",
    productCode: "EVERYDAY_PLUS",
    applicant: {
      fullName: formatFullName(DEMO_CUSTOMER),
      dateOfBirth: DEMO_CUSTOMER.dateOfBirth,
      email: DEMO_CUSTOMER.email,
      mobile: DEMO_CUSTOMER.mobile,
      address: applicationAddress,
    },
  };

  it("derives stable customer and account references", () => {
    const first = createCustomer(createRequest);
    const second = createCustomer(createRequest);

    expect(first.customerId).toBe(second.customerId);
    expect(first.accountId).toBe(second.accountId);
    expect(first.customerId).toMatch(/^CUST-/);
  });

  it("keeps screening vocabulary out of customer communications", () => {
    const message = generateCommunication({
      caseId: "ONB-10027",
      templateId: "WELCOME_ACCOUNT_OPENED",
      customerFirstName: "Ananya",
      productName: "Everyday Plus Account",
      customerId: "CUST-100482",
      accountId: "ACC-29814",
    });

    expect(message.subject).toContain("Everyday Plus Account");
    expect(message.body).toContain("CUST-100482");
    expect(`${message.subject} ${message.body}`).not.toMatch(
      /PEP|sanction|screening|review|confidence/i,
    );
  });

  it("uses a neutral saved-application template on the failure path", () => {
    const message = generateCommunication({
      caseId: "ONB-10027",
      templateId: "APPLICATION_SAVED",
      customerFirstName: "Ananya",
      productName: "Everyday Plus Account",
    });

    expect(message.body).toContain("saved your application");
    expect(message.body).not.toMatch(/error|failure|timeout/i);
  });
});

describe("idempotency", () => {
  it("runs the operation once and replays the stored result", async () => {
    let calls = 0;
    const operation = () => {
      calls += 1;
      return { customerId: `CUST-${calls}` };
    };

    const first = await runIdempotent("create-customer", "key-1", { a: 1 }, operation);
    const second = await runIdempotent("create-customer", "key-1", { a: 1 }, operation);

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.result).toEqual(first.result);
    expect(calls).toBe(1);
  });

  it("rejects reuse of a key with a different payload", async () => {
    await runIdempotent("create-customer", "key-1", { a: 1 }, () => ({ ok: true }));

    await expect(
      runIdempotent("create-customer", "key-1", { a: 2 }, () => ({ ok: true })),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("scopes keys per tool so unrelated tools cannot collide", async () => {
    const first = await runIdempotent("create-customer", "shared", {}, () => "a");
    const second = await runIdempotent("check-duplicate", "shared", {}, () => "b");

    expect(first.result).toBe("a");
    expect(second.result).toBe("b");
    expect(second.replayed).toBe(false);
  });

  it("always executes when no key is supplied", async () => {
    let calls = 0;
    const operation = () => {
      calls += 1;
      return calls;
    };

    await runIdempotent("screen-pep", undefined, {}, operation);
    await runIdempotent("screen-pep", undefined, {}, operation);

    expect(calls).toBe(2);
  });
});

describe("tool registry", () => {
  it("exposes exactly the approved tool allowlist", () => {
    expect(listTools().map((tool) => tool.name).sort()).toEqual(
      [
        "check-credit-bureau",
        "check-duplicate",
        "create-customer",
        "extract-address",
        "extract-identity",
        "generate-communication",
        "screen-pep",
        "screen-sanctions",
        "validate-address",
        "verify-identity",
      ].sort(),
    );
  });

  it("rejects a tool name that is not allowlisted", () => {
    expect(isToolName("drop-database")).toBe(false);
    expect(isToolName("create-customer")).toBe(true);
  });

  it("requires an idempotency key only for the tool with a side effect", () => {
    expect(getToolDefinition("create-customer").requiresIdempotencyKey).toBe(true);
    expect(getToolDefinition("screen-pep").requiresIdempotencyKey).toBe(false);
  });
});
