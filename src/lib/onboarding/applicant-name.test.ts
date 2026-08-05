// @vitest-environment node
import { describe, expect, it } from "vitest";

import { formatFullName, splitFullName } from "@/lib/onboarding/applicant-name";

describe("formatFullName", () => {
  it("joins the captured parts", () => {
    expect(formatFullName({ firstName: "Ananya", lastName: "Rao" })).toBe(
      "Ananya Rao",
    );
  });

  it("trims stray whitespace rather than passing it to Pega", () => {
    expect(formatFullName({ firstName: "  Ananya ", lastName: " Rao  " })).toBe(
      "Ananya Rao",
    );
  });

  it("omits an empty part instead of leaving a dangling space", () => {
    expect(formatFullName({ firstName: "Ananya", lastName: "" })).toBe("Ananya");
    expect(formatFullName({ firstName: "", lastName: "Rao" })).toBe("Rao");
    expect(formatFullName({ firstName: "", lastName: "" })).toBe("");
  });
});

describe("splitFullName", () => {
  it("recovers both parts from a two-word name", () => {
    expect(splitFullName("Ananya Rao")).toEqual({
      firstName: "Ananya",
      lastName: "Rao",
    });
  });

  it("keeps multi-word surnames intact", () => {
    expect(splitFullName("Maria del Carmen Garcia")).toEqual({
      firstName: "Maria",
      lastName: "del Carmen Garcia",
    });
  });

  it("does not invent a last name for a single-token name", () => {
    expect(splitFullName("Prince")).toEqual({
      firstName: "Prince",
      lastName: "",
    });
  });

  it("tolerates padding and repeated separators", () => {
    expect(splitFullName("   Ananya    Rao   ")).toEqual({
      firstName: "Ananya",
      lastName: "Rao",
    });
  });

  it("returns empty parts for an empty name", () => {
    expect(splitFullName("   ")).toEqual({ firstName: "", lastName: "" });
  });

  it("round-trips a composed name", () => {
    const parts = { firstName: "Ananya", lastName: "Rao" };
    expect(splitFullName(formatFullName(parts))).toEqual(parts);
  });
});
