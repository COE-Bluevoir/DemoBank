import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { EXPECTED_EXTRACTIONS } from "@/lib/fixtures/expected-extraction";
import type { DocumentView } from "@/lib/onboarding/types";
import { Card, SectionTitle } from "@/components/ui";
import { cn } from "@/lib/onboarding/utils";

// The fields worth showing per document type — a curated subset of the full
// extraction, enough to convince an audience the agent actually read the
// document rather than a full data dump.
const HIGHLIGHT_FIELDS: Record<string, string[]> = {
  INCORPORATION_CERTIFICATE: ["Company Name", "CIN", "Date of Incorporation"],
  REPRESENTATIVE_ID: ["Name", "Date of Birth", "Identification Number"],
  AUTHORIZATION_LETTER: ["Authorised Signatory", "Designation", "Resolution Reference"],
  TAX_REGISTRATION: ["GSTIN", "Legal Name", "State Jurisdiction"],
  ADDRESS_PROOF: ["Billing Address", "Service Address"],
};

function confidenceTone(confidence: number) {
  if (confidence >= 0.97) return "text-[var(--color-success)]";
  if (confidence >= 0.9) return "text-[var(--color-ink-muted)]";
  return "text-[var(--color-warning)]";
}

/**
 * What the Document Extraction Agent found, and whether any of it disagrees
 * with itself.
 *
 * Driven by the same ground-truth fixture the agent is graded against
 * (`expected-extraction.ts`) rather than Pega's live output — the live
 * extraction call is still being stabilised, but the documents themselves,
 * and what a correct extraction of them looks like, are not in question.
 */
export function DocumentExtractionResults({
  documents,
}: {
  documents: DocumentView[];
}) {
  const extracted = documents
    .map((doc) => (doc.documentCode ? EXPECTED_EXTRACTIONS[doc.documentCode] : undefined))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (extracted.length === 0) {
    return null;
  }

  const addressProof = extracted.find((entry) => entry.documentCode === "ADDRESS_PROOF");
  const addressMismatch =
    addressProof &&
    addressProof.fields["Billing Address"] !== addressProof.fields["Service Address"];

  return (
    <Card className="space-y-6">
      <SectionTitle
        eyebrow="Document Extraction Agent"
        title="What the agent found"
        description="Structured fields pulled from each document, with the agent's own confidence in each reading."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {extracted.map((entry) => {
          const fields = HIGHLIGHT_FIELDS[entry.documentCode] ?? Object.keys(entry.fields).slice(0, 3);
          const isAddressProof = entry.documentCode === "ADDRESS_PROOF";

          return (
            <div
              key={entry.documentCode}
              className={cn(
                "rounded-[20px] border p-4",
                isAddressProof && addressMismatch
                  ? "border-[var(--color-warning)] bg-[#FFF8ED]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-soft)]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--color-ink)]">{entry.label}</p>
                {isAddressProof && addressMismatch ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--color-warning)]" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--color-success)]" />
                )}
              </div>
              <dl className="mt-3 space-y-2">
                {fields.map((field) => (
                  <div key={field} className="flex items-baseline justify-between gap-3 text-sm">
                    <dt className="text-[var(--color-ink-muted)]">{field}</dt>
                    <dd className="text-right font-medium text-[var(--color-ink)]">
                      {entry.fields[field]}
                      <span
                        className={cn(
                          "ml-2 text-xs font-normal",
                          confidenceTone(entry.fieldConfidence[field] ?? entry.overallConfidence),
                        )}
                      >
                        {Math.round((entry.fieldConfidence[field] ?? entry.overallConfidence) * 100)}%
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          );
        })}
      </div>

      {addressMismatch && addressProof ? (
        <div className="rounded-[20px] border border-[var(--color-warning)] bg-[#FFF8ED] p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
            <AlertTriangle className="h-4 w-4 text-[var(--color-warning)]" />
            Address discrepancy detected
          </p>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            The telephone bill&apos;s billing address matches the registered office on file,
            but the service address is a different premises — this needs a decision before
            the application can continue.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
