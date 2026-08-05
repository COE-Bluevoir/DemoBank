import { describe, expect, it } from "vitest";

import { DEMO_CUSTOMER } from "@/lib/onboarding/constants";
import {
  applicantSchema,
  validateDocumentFileType,
} from "@/lib/onboarding/schemas";

describe("validation schemas", () => {
  it("accepts the demo applicant profile", () => {
    const parsed = applicantSchema.parse(DEMO_CUSTOMER);
    expect(parsed.firstName).toBe("Ananya");
    expect(parsed.lastName).toBe("Rao");
  });

  it("rejects unsupported upload types", () => {
    expect(validateDocumentFileType("application/pdf")).toBe(true);
    expect(validateDocumentFileType("text/plain")).toBe(false);
  });
});
