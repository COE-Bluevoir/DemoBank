// @vitest-environment node
import { describe, expect, it } from "vitest";

import { listIndustryPacks } from "@/lib/industry/registry";
import { EXPECTED_EXTRACTIONS } from "@/lib/fixtures/expected-extraction";

/**
 * One platform adapting by configuration only works if the configuration is
 * complete. Anything a journey renders that is not in the pack becomes the
 * reference industry's wording showing up in another industry's journey —
 * which is exactly the inconsistency this suite exists to prevent.
 */

const packs = listIndustryPacks();

describe("every industry is fully configured", () => {
  it.each(packs)("$displayName declares its own identity", (pack) => {
    expect(pack.industryCode).toBeTruthy();
    expect(pack.journeyCode).toBeTruthy();
    expect(pack.productOrServiceCode).toBeTruthy();
    expect(pack.consentTextVersion).toBeTruthy();
  });

  it.each(packs)("$displayName asks for its own evidence", (pack) => {
    expect(pack.documentProfile.length).toBeGreaterThanOrEqual(4);

    for (const requirement of pack.documentProfile) {
      expect(requirement.label.trim()).not.toBe("");
      expect(requirement.description.trim()).not.toBe("");
      expect(["IDENTITY", "ADDRESS"]).toContain(requirement.kind);
    }
  });

  it.each(packs)("$displayName has ground truth for what it asks for", (pack) => {
    // A document the journey requests but has no expected extraction for
    // cannot be checked, so the storyline could pass while the agent read it
    // wrongly.
    for (const requirement of pack.documentProfile) {
      expect(
        EXPECTED_EXTRACTIONS[requirement.code],
        `no ground truth for ${requirement.code}`,
      ).toBeTruthy();
    }
  });

  it.each(packs)("$displayName names itself, never the reference bank", (pack) => {
    const surfaces = [
      pack.brand.organisationName,
      pack.brand.productName,
      pack.brand.tagline,
      pack.objective,
      pack.consentText,
      pack.terminology.completionHeading,
      pack.terminology.intakeHeading,
      ...pack.documentProfile.map((item) => `${item.label} ${item.description}`),
    ].join(" ");

    if (pack.id !== "banking") {
      expect(surfaces).not.toMatch(/NorthStar|Everyday Plus/i);
    }

    // Its own consent wording must name its own organisation, or a customer
    // is agreeing to terms with a company they are not dealing with.
    expect(pack.consentText).toContain(pack.brand.organisationName);
  });

  it("gives each industry distinct branding and vocabulary", () => {
    const distinct = (values: string[]) => new Set(values).size === values.length;

    expect(distinct(packs.map((pack) => pack.brand.organisationName))).toBe(true);
    expect(distinct(packs.map((pack) => pack.brand.productName))).toBe(true);
    expect(distinct(packs.map((pack) => pack.brand.accent))).toBe(true);
    expect(distinct(packs.map((pack) => pack.terminology.customerNoun))).toBe(true);
    expect(distinct(packs.map((pack) => pack.journeyCode))).toBe(true);
  });

  it("runs the checks each industry actually needs", () => {
    const byId = Object.fromEntries(packs.map((pack) => [pack.id, pack]));

    // Serviceability is a telecom question; asking it of a bank account would
    // be meaningless, and not asking it of a fibre order would let the demo
    // skip the constraint the telecom storyline turns on.
    expect(byId.telecom.checkProfile.checkServiceability).toBe(true);
    expect(byId.banking.checkProfile.checkServiceability).toBe(false);
    expect(byId.insurance.checkProfile.checkServiceability).toBe(false);

    // Screening the representative is what produces the banking PEP finding.
    expect(byId.banking.checkProfile.screenParty).toBe(true);

    // Every industry verifies the organisation exists.
    for (const pack of packs) {
      expect(pack.checkProfile.verifyEntity).toBe(true);
    }
  });
});
