// @vitest-environment node
import { describe, expect, it } from "vitest";

import { conformToAllowedValues } from "@/lib/pega/adapter";

/**
 * Pega runs one common flow for every industry, but the industry packs choose
 * their own vocabulary. A value outside Pega's list fails the whole
 * submission, not just that field, so the customer's answer is conformed to
 * what the action actually offers.
 */

/** The shape Pega returns for a dropdown, trimmed to what is read. */
function dropdown(...values: string[]) {
  return [{ datasource: { records: values.map((value) => ({ key: value })) } }];
}

const EMPLOYMENT_FIELDS = {
  EmploymentStatus: dropdown("Salaried", "Self-employed", "Student", "Other"),
  IncomeRange: dropdown("INR 0-5 lakh per annum", "INR 5-10 lakh per annum"),
  TaxResidency: dropdown("India", "United Kingdom", "Other"),
};

const PICKLISTS = ["EmploymentStatus", "IncomeRange", "TaxResidency"] as const;

describe("conforming answers to Pega's lists", () => {
  it("passes a value Pega offers straight through", () => {
    const result = conformToAllowedValues(
      { EmploymentStatus: "Salaried", TaxResidency: "India" },
      EMPLOYMENT_FIELDS,
      PICKLISTS,
    );

    expect(result.EmploymentStatus).toBe("Salaried");
    expect(result.TaxResidency).toBe("India");
  });

  it("maps an unlisted answer to Other rather than failing the submission", () => {
    // The insurance pack offers "Retired"; Pega's common flow does not.
    const result = conformToAllowedValues(
      { EmploymentStatus: "Retired" },
      EMPLOYMENT_FIELDS,
      PICKLISTS,
    );

    expect(result.EmploymentStatus).toBe("Other");
  });

  it("omits an unlisted answer when the list has no Other", () => {
    // Inventing a bracket would misstate the customer's income.
    const result = conformToAllowedValues(
      { IncomeRange: "INR 40-50 lakh per annum" },
      EMPLOYMENT_FIELDS,
      PICKLISTS,
    );

    expect("IncomeRange" in result).toBe(false);
  });

  it("leaves fields Pega does not present as a list alone", () => {
    const result = conformToAllowedValues(
      { EmploymentStatus: "Anything at all" },
      {},
      PICKLISTS,
    );

    expect(result.EmploymentStatus).toBe("Anything at all");
  });

  it("does not mutate the content it was given", () => {
    const content = { EmploymentStatus: "Retired" };

    conformToAllowedValues(content, EMPLOYMENT_FIELDS, PICKLISTS);

    expect(content.EmploymentStatus).toBe("Retired");
  });

  it("leaves properties outside the picklist set untouched", () => {
    const result = conformToAllowedValues(
      { EmploymentStatus: "Retired", CustomerOnboardingName: "Ananya Rao" },
      EMPLOYMENT_FIELDS,
      PICKLISTS,
    );

    expect(result.CustomerOnboardingName).toBe("Ananya Rao");
  });
});
