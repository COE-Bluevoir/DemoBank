// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  DEFAULT_INDUSTRY,
  getIndustryPack,
  isIndustryId,
  listIndustryPacks,
  listProductOptions,
  resolveIndustryPack,
  resolveProductName,
} from "@/lib/industry/registry";
import { applicantSchema } from "@/lib/onboarding/schemas";

describe("industry registry", () => {
  it("exposes the three configured industries", () => {
    expect(listIndustryPacks().map((pack) => pack.id)).toEqual([
      "banking",
      "insurance",
      "telecom",
    ]);
  });

  it("treats banking as the reference implementation", () => {
    expect(DEFAULT_INDUSTRY).toBe("banking");
    expect(getIndustryPack("banking").completeness).toBe(
      "reference-implementation",
    );
  });

  it("marks the other industries as adaptability demonstrations", () => {
    // Overstating their depth is the failure mode this guards against.
    for (const id of ["insurance", "telecom"] as const) {
      expect(getIndustryPack(id).completeness).toBe(
        "adaptability-demonstration",
      );
    }
  });

  it("rejects an unknown industry id", () => {
    expect(isIndustryId("banking")).toBe(true);
    expect(isIndustryId("automotive")).toBe(false);
  });

  it("falls back to the reference industry for unknown or absent input", () => {
    expect(resolveIndustryPack(undefined).id).toBe("banking");
    expect(resolveIndustryPack("automotive").id).toBe("banking");
    expect(resolveIndustryPack("telecom").id).toBe("telecom");
  });
});

describe("product options", () => {
  it("offers banking's several products, distinctly coded and named", () => {
    const options = listProductOptions(getIndustryPack("banking"));

    expect(options.length).toBeGreaterThan(1);
    expect(new Set(options.map((option) => option.code)).size).toBe(
      options.length,
    );
    expect(new Set(options.map((option) => option.name)).size).toBe(
      options.length,
    );
  });

  it("falls back to the pack's single default for an industry with only one product", () => {
    const pack = getIndustryPack("insurance");
    const options = listProductOptions(pack);

    expect(options).toEqual([
      {
        code: pack.productOrServiceCode,
        name: pack.brand.productName,
        tagline: pack.brand.tagline,
        description: pack.objective,
      },
    ]);
  });

  it("resolves a known product code to its display name", () => {
    const pack = getIndustryPack("banking");
    const [firstOption] = listProductOptions(pack);

    expect(resolveProductName(pack, firstOption.code)).toBe(firstOption.name);
  });

  it("falls back to the pack's default name for an unrecognised product code", () => {
    const pack = getIndustryPack("banking");

    expect(resolveProductName(pack, "NOT-A-REAL-CODE")).toBe(
      pack.brand.productName,
    );
  });
});

describe("industry pack contents", () => {
  const packs = listIndustryPacks();

  it("gives every industry its own branding and vocabulary", () => {
    const organisations = packs.map((pack) => pack.brand.organisationName);
    const products = packs.map((pack) => pack.brand.productName);
    const customerNouns = packs.map((pack) => pack.terminology.customerNoun);

    expect(new Set(organisations).size).toBe(packs.length);
    expect(new Set(products).size).toBe(packs.length);
    expect(new Set(customerNouns).size).toBe(packs.length);
  });

  it("collects details that satisfy the shared applicant contract", () => {
    // Every pack feeds the same orchestration contract, so its sample data
    // must validate against the one schema the platform uses.
    for (const pack of packs) {
      expect(applicantSchema.safeParse(pack.sampleApplicant).success).toBe(true);
    }
  });

  it("only collects fields the shared applicant model can store", () => {
    const allowed = new Set(
      Object.keys(applicantSchema.shape) as Array<string>,
    );

    for (const pack of packs) {
      for (const field of pack.intakeFields) {
        expect(allowed.has(field.key)).toBe(true);
      }
    }
  });

  it("requires identity and address evidence in every industry", () => {
    for (const pack of packs) {
      const kinds = pack.requiredDocuments.map((document) => document.kind);
      expect(kinds).toContain("IDENTITY");
      expect(kinds).toContain("ADDRESS");
    }
  });

  it("names the industry's own organisation in its consent wording", () => {
    for (const pack of packs) {
      expect(pack.consentText).toContain(pack.brand.organisationName);
    }
  });

  it("labels every intake field", () => {
    for (const pack of packs) {
      for (const field of pack.intakeFields) {
        expect(field.label.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
