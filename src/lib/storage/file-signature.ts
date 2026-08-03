/**
 * Magic-byte inspection for uploaded documents.
 *
 * A browser-supplied `Content-Type` is a claim, not evidence. Every upload is
 * sniffed so a renamed executable cannot enter the pipeline as a PDF.
 */

export type SniffedFileType = "application/pdf" | "image/jpeg" | "image/png";

interface Signature {
  type: SniffedFileType;
  /** Byte prefix that identifies the format. */
  magic: readonly number[];
}

const SIGNATURES: readonly Signature[] = [
  // "%PDF"
  { type: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  // JPEG SOI + marker
  { type: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  // PNG signature
  { type: "image/png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

/** Longest prefix any signature needs. */
export const SIGNATURE_PROBE_BYTES = 8;

/** Identify a file from its leading bytes, or `undefined` if unrecognised. */
export function sniffFileType(bytes: Uint8Array): SniffedFileType | undefined {
  return SIGNATURES.find((signature) =>
    signature.magic.every((byte, index) => bytes[index] === byte),
  )?.type;
}

/**
 * Confirm the real content matches what the client declared.
 *
 * JPEG is accepted for both `image/jpeg` and the legacy `image/jpg` spelling
 * that some browsers and scanners still emit.
 */
export function contentMatchesDeclaredType(
  declaredType: string,
  sniffedType: SniffedFileType,
): boolean {
  if (sniffedType === "image/jpeg") {
    return declaredType === "image/jpeg" || declaredType === "image/jpg";
  }

  return declaredType === sniffedType;
}
