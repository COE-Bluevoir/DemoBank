import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DocumentRequirement } from "@/lib/industry/types";

/**
 * Sample evidence for the demo path.
 *
 * These are the real synthetic documents under `public/sample-docs/` — the
 * same files a presenter uploads by hand, and the ones `EXPECTED_EXTRACTIONS`
 * is ground truth for. The "Use sample documents" shortcut must hand Pega the
 * same evidence a manual upload would, not a placeholder, or the extraction
 * and screening steps downstream have nothing real to work from.
 */

const SAMPLE_DOCS_DIR = path.join(process.cwd(), "public", "sample-docs");

const cache = new Map<string, Uint8Array>();

/** The bytes of a requirement's sample file, read once and cached. */
export async function sampleDocumentBytes(
  requirement: DocumentRequirement,
): Promise<Uint8Array> {
  const cached = cache.get(requirement.sampleFile);

  if (cached) {
    return Uint8Array.from(cached);
  }

  const filePath = path.join(SAMPLE_DOCS_DIR, requirement.sampleFile);
  const buffer = await readFile(filePath);
  const bytes = new Uint8Array(buffer);

  cache.set(requirement.sampleFile, bytes);

  return Uint8Array.from(bytes);
}

/** Content type for a requirement's sample file, from its extension. */
export function sampleDocumentContentType(
  requirement: DocumentRequirement,
): string {
  return requirement.sampleFile.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : "image/png";
}
