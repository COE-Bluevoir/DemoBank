// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  SAMPLE_DOCUMENT_FILE_NAMES,
  sampleDocumentPdf,
} from "@/lib/pega/sample-documents";

/**
 * Pega stores and renders these files, so a malformed PDF fails as an opaque
 * upload error rather than as a bad file. The structure is asserted here
 * because that failure is expensive to diagnose from the other end.
 */

function asText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("latin1");
}

describe("sample documents", () => {
  it.each(["IDENTITY", "ADDRESS"] as const)(
    "%s is a structurally valid PDF",
    (kind) => {
      const text = asText(sampleDocumentPdf(kind));

      expect(text.startsWith("%PDF-")).toBe(true);
      expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
      expect(text).toContain("/Root");

      const startXref = Number(/startxref\s+(\d+)/.exec(text)?.[1]);
      expect(text.slice(startXref, startXref + 4)).toBe("xref");

      // Every cross-reference offset must land on its object header. This is
      // where hand-assembled PDFs usually break, and readers reject the file.
      const offsets = [...text.slice(startXref).matchAll(/^(\d{10}) 00000 n/gm)]
        .map((match) => Number(match[1]));

      expect(offsets).toHaveLength(6);
      offsets.forEach((offset, index) => {
        expect(text.slice(offset)).toMatch(new RegExp(`^${index + 1} 0 obj`));
      });
    },
  );

  it("marks both documents as specimens", () => {
    for (const kind of ["IDENTITY", "ADDRESS"] as const) {
      expect(asText(sampleDocumentPdf(kind))).toContain(
        "SPECIMEN - NOT A VALID DOCUMENT",
      );
    }
  });

  it("gives the two documents different addresses", () => {
    // The proof of address deliberately disagrees with the identity document
    // so the journey exercises its discrepancy path rather than only ever
    // seeing a clean case.
    const identity = asText(sampleDocumentPdf("IDENTITY"));
    const address = asText(sampleDocumentPdf("ADDRESS"));

    expect(identity).toContain("18 Lake View Road");
    expect(address).toContain("81 Lake View Road");
    expect(identity).not.toEqual(address);
    expect(SAMPLE_DOCUMENT_FILE_NAMES.IDENTITY).not.toEqual(
      SAMPLE_DOCUMENT_FILE_NAMES.ADDRESS,
    );
  });

  it("does not hand out a buffer callers can mutate", () => {
    const first = sampleDocumentPdf("IDENTITY");
    first[0] = 0;

    expect(sampleDocumentPdf("IDENTITY")[0]).toBe("%".charCodeAt(0));
  });
});
