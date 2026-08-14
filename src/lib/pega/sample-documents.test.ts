// @vitest-environment node
import { describe, expect, it } from "vitest";

import { bankingPack } from "@/lib/industry/packs/banking";
import { insurancePack } from "@/lib/industry/packs/insurance";
import { telecomPack } from "@/lib/industry/packs/telecom";
import {
  sampleDocumentBytes,
  sampleDocumentContentType,
} from "@/lib/pega/sample-documents";

/**
 * Every requirement's `sampleFile` must resolve to a real, non-empty asset
 * under `public/sample-docs/` — a typo here fails silently as a missing
 * upload rather than a build error, so it is asserted for every pack.
 */

const PACKS = [bankingPack, insurancePack, telecomPack];

describe("sample documents", () => {
  it.each(PACKS.flatMap((pack) => pack.documentProfile.map((requirement) => [pack.id, requirement] as const)))(
    "%s/%s reads a non-empty PNG",
    async (_packId, requirement) => {
      const bytes = await sampleDocumentBytes(requirement);

      expect(bytes.byteLength).toBeGreaterThan(0);
      // PNG signature.
      expect(Array.from(bytes.slice(0, 8))).toEqual([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      expect(sampleDocumentContentType(requirement)).toBe("image/png");
    },
  );

  it("does not hand out a buffer callers can mutate", async () => {
    const requirement = bankingPack.documentProfile[0];
    const first = await sampleDocumentBytes(requirement);
    const originalFirstByte = first[0];
    first[0] = 0;

    const second = await sampleDocumentBytes(requirement);
    expect(second[0]).toBe(originalFirstByte);
  });
});
