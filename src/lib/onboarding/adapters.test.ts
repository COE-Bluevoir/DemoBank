// @vitest-environment node
import { describe, expect, it } from "vitest";

import { resolveCaseMode } from "@/lib/onboarding/adapters";

/**
 * The switch is only trustworthy if a case stays with the system that opened
 * it. Reading a shared setting instead would mean that flipping the switch —
 * or another visitor flipping it — sent the rest of an application to a
 * system that has never heard of it.
 */

describe("case ownership", () => {
  it("keeps AWS cases on AWS", () => {
    expect(resolveCaseMode("NPG-4DE76E63")).toBe("non-pega");
  });

  it("keeps mock cases on the mock engine", () => {
    expect(resolveCaseMode("ONB-10027")).toBe("mock-pega");
  });

  it("treats Pega's own identifiers as Pega's", () => {
    expect(resolveCaseMode("ODHMNT-AGENTICC-WORK C-195036")).toBe("pega");
  });

  it("does not send an unrecognised reference to the mock engine", () => {
    // A case Pega minted under a different application still belongs to Pega.
    // Guessing "mock" would silently answer with a fabricated case instead of
    // reporting that this one could not be found.
    expect(resolveCaseMode("SOMEOTHER-WORK X-1")).toBe("pega");
  });

  it("is not fooled by a prefix appearing later in the reference", () => {
    expect(resolveCaseMode("ODHMNT-WORK NPG-1")).toBe("pega");
    expect(resolveCaseMode("ODHMNT-WORK ONB-1")).toBe("pega");
  });
});
