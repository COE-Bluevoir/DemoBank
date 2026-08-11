// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isUnsupportedContentFailure } from "@/lib/pega/adapter";
import { PegaIntegrationError } from "@/lib/pega/errors";

/**
 * The integration contract and the deployed case type disagree.
 *
 * The contract asks for `IndustryCode`, `JourneyCode` and an `Organization`
 * page on create; the build currently running exposes none of them, and Pega
 * rejects a whole submission that contains a property its view does not
 * define. So the richer payload is attempted first and the journey falls back.
 *
 * This distinction has to be exact. Treating a genuine validation failure as
 * "Pega hasn't caught up" would retry with less data and quietly succeed,
 * hiding a real problem with what the customer submitted.
 */

function failure(technicalDetail: string) {
  return new PegaIntegrationError("VALIDATION", { technicalDetail });
}

describe("recognising a case type that predates the contract", () => {
  it("recognises Pega's unsupported-property rejection", () => {
    expect(
      isUnsupportedContentFailure(failure("Error_Invalid_Inputs_content")),
    ).toBe(true);
  });

  it("recognises the refusal as Pega actually reports it", () => {
    // The real body carries the classification alongside the message.
    expect(
      isUnsupportedContentFailure(
        failure(
          'POST /cases returned HTTP 400. {"errorClassification":"Invalid inputs",' +
            '"localizedValue":"One or more inputs are invalid","errorDetails":' +
            '[{"message":"Error_Invalid_Inputs_content"}]}',
        ),
      ),
    ).toBe(true);
  });

  it("does not mistake a missing attachment for an outdated case type", () => {
    // Falling back here would submit less evidence and look like progress.
    expect(
      isUnsupportedContentFailure(
        failure("Attachment content is empty, please upload at least one"),
      ),
    ).toBe(false);
  });

  it("does not mistake a stale write for an outdated case type", () => {
    expect(isUnsupportedContentFailure(failure("eTag mismatch"))).toBe(false);
  });

  it("ignores anything that is not a Pega failure", () => {
    expect(isUnsupportedContentFailure(new Error("network down"))).toBe(false);
    expect(isUnsupportedContentFailure(undefined)).toBe(false);
  });
});
