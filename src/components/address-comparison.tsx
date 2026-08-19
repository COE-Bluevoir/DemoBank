"use client";

import { useRef, useState } from "react";

import { Button, Card, SectionTitle } from "@/components/ui";

export function AddressComparison({
  applicationAddress,
  documentAddress,
  busy,
  onConfirm,
  onUploadCorrection,
}: {
  applicationAddress: string;
  documentAddress: string;
  busy?: boolean;
  onConfirm: (selectedAddress: string) => void;
  /** A corrected document was chosen — resolve the case with it. */
  onUploadCorrection?: (file: File) => void;
}) {
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <Card className="space-y-6">
      <SectionTitle
        title="Confirm your address"
        description="We found a difference in your address. Please confirm which one should be used for this application."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {[
          { label: "Application", value: applicationAddress },
          { label: "Proof of address", value: documentAddress },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => setSelectedAddress(item.value)}
            className={
              selectedAddress === item.value
                ? "rounded-[24px] border-2 border-[var(--color-primary)] bg-[#EAF3F8] p-5 text-left"
                : "rounded-[24px] border border-[var(--color-border-strong)] bg-white p-5 text-left"
            }
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
              {item.label}
            </p>
            <p className="mt-3 text-lg font-semibold text-[var(--color-ink)]">
              {item.value}
            </p>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={!selectedAddress || busy}
          onClick={() => selectedAddress && onConfirm(selectedAddress)}
        >
          Confirm selected address
        </Button>
        {onUploadCorrection ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onUploadCorrection(file);
                }
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload another document
            </Button>
          </>
        ) : null}
      </div>
      <p className="text-sm text-[var(--color-ink-subtle)]">
        The address on the proof of address doesn&apos;t match. Confirm which address is
        correct, or upload a corrected document if the one on file was wrong.
      </p>
    </Card>
  );
}
