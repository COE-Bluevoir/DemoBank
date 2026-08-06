/**
 * Sample identity documents for the demo path.
 *
 * These are generated as genuine, well-formed PDFs rather than placeholder
 * bytes: Pega stores and renders them, and a malformed file fails in ways that
 * look like an integration bug. Every one is stamped SPECIMEN and carries
 * obviously invalid numbers so it cannot be mistaken for a real document.
 */

export type SampleDocumentKind = "IDENTITY" | "ADDRESS";

interface DocumentField {
  label: string;
  value: string;
}

/**
 * Details differ between the two documents on purpose.
 *
 * The address on the proof-of-address deliberately does not match the address
 * on the identity document, so the journey exercises its discrepancy path
 * instead of only ever seeing a clean case.
 */
const SPECIMENS: Record<
  SampleDocumentKind,
  { title: string; subtitle: string; fields: DocumentField[] }
> = {
  IDENTITY: {
    title: "AADHAAR",
    subtitle: "Unique Identification Authority of India",
    fields: [
      { label: "Name", value: "Avery Thompson" },
      { label: "Date of Birth", value: "17/04/1988" },
      { label: "Gender", value: "Female" },
      { label: "Aadhaar Number", value: "0000 0000 0000" },
      { label: "Address", value: "18 Lake View Road, San Francisco" },
      { label: "Issued", value: "12/03/2019" },
    ],
  },
  ADDRESS: {
    title: "AADHAAR",
    subtitle: "Unique Identification Authority of India",
    fields: [
      { label: "Name", value: "Avery Thompson" },
      { label: "Date of Birth", value: "17/04/1988" },
      { label: "Gender", value: "Female" },
      { label: "Aadhaar Number", value: "0000 0000 0000" },
      { label: "Address", value: "81 Lake View Road, San Francisco" },
      { label: "Issued", value: "04/09/2023" },
    ],
  },
};

/** Escape the characters that terminate or nest a PDF string literal. */
function escapePdfText(value: string): string {
  return value.replace(/([\\()])/g, "\\$1");
}

interface TextLine {
  text: string;
  x: number;
  y: number;
  size: number;
  bold: boolean;
}

function layout(kind: SampleDocumentKind): TextLine[] {
  const specimen = SPECIMENS[kind];
  const lines: TextLine[] = [
    { text: specimen.title, x: 60, y: 300, size: 22, bold: true },
    { text: specimen.subtitle, x: 60, y: 278, size: 9, bold: false },
    {
      text: kind === "IDENTITY" ? "Proof of Identity" : "Proof of Address",
      x: 60,
      y: 256,
      size: 11,
      bold: true,
    },
  ];

  specimen.fields.forEach((field, index) => {
    const y = 224 - index * 22;
    lines.push({ text: `${field.label}:`, x: 60, y, size: 10, bold: true });
    lines.push({ text: field.value, x: 190, y, size: 10, bold: false });
  });

  lines.push({
    text: "SPECIMEN - NOT A VALID DOCUMENT - GENERATED FOR DEMONSTRATION",
    x: 60,
    y: 60,
    size: 9,
    bold: true,
  });

  return lines;
}

function contentStream(kind: SampleDocumentKind): string {
  const border = "0.4 w 0.2 0.2 0.2 RG 40 40 majorBoxWidth majorBoxHeight re S"
    .replace("majorBoxWidth", "440")
    .replace("majorBoxHeight", "300");

  const text = layout(kind)
    .map(
      (line) =>
        `BT /${line.bold ? "F2" : "F1"} ${line.size} Tf ${line.x} ${line.y} Td (${escapePdfText(line.text)}) Tj ET`,
    )
    .join("\n");

  return `${border}\n${text}\n`;
}

/**
 * Assemble a single-page PDF.
 *
 * The cross-reference table stores each object's byte offset, so the file is
 * built up while measuring as it goes — computing offsets after the fact is
 * where hand-written PDFs usually break.
 */
function buildPdf(kind: SampleDocumentKind): Uint8Array {
  const stream = contentStream(kind);

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 520 380] " +
      "/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const startXref = Buffer.byteLength(pdf, "latin1");

  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${startXref}\n%%EOF\n`;

  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

const cache = new Map<SampleDocumentKind, Uint8Array>();

/** A valid, clearly-marked specimen PDF for the given document kind. */
export function sampleDocumentPdf(kind: SampleDocumentKind): Uint8Array {
  const cached = cache.get(kind);

  if (cached) {
    // Copy so a caller cannot mutate the shared buffer.
    return Uint8Array.from(cached);
  }

  const built = buildPdf(kind);
  cache.set(kind, built);

  return Uint8Array.from(built);
}

export const SAMPLE_DOCUMENT_FILE_NAMES: Record<SampleDocumentKind, string> = {
  IDENTITY: "Aadhaar_Identity_Specimen.pdf",
  ADDRESS: "Aadhaar_Address_Specimen.pdf",
};
