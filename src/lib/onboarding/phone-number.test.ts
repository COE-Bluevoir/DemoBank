import { describe, expect, it } from "vitest";

import {
  formatInternationalMobile,
  parseInternationalMobile,
} from "@/lib/onboarding/phone-number";

describe("parseInternationalMobile", () => {
  it("splits a stored Indian mobile into dial code and national number", () => {
    expect(parseInternationalMobile("+91 90000 00000")).toEqual({
      iso: "IN",
      dial: "91",
      national: "9000000000",
    });
  });

  it("recognises a United Kingdom number", () => {
    expect(parseInternationalMobile("+44 7700 900123")).toMatchObject({
      iso: "GB",
      dial: "44",
      national: "7700900123",
    });
  });

  it("treats a number without a plus as local to India", () => {
    expect(parseInternationalMobile("08466066935")).toEqual({
      iso: "IN",
      dial: "91",
      national: "8466066935",
    });
  });
});

describe("formatInternationalMobile", () => {
  it("joins the selected extension and the national number", () => {
    expect(formatInternationalMobile("971", "501234567")).toBe("+971 501234567");
  });
});
