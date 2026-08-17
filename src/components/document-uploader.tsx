"use client";

import { Upload, X } from "lucide-react";

import type { DocumentRequirement, IndustryPack } from "@/lib/industry/types";
import type { DocumentKind, DocumentView } from "@/lib/onboarding/types";
import { formatBytes } from "@/lib/onboarding/utils";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";

interface UploadingState {
  documentCode: string;
  progress: number;
}

function DocSlot({
  requirement,
  document,
  uploading,
  onFileChange,
  onRemove,
}: {
  requirement: DocumentRequirement;
  document?: DocumentView;
  uploading?: UploadingState | null;
  onFileChange: (requirement: DocumentRequirement, file: File) => void;
  onRemove: (kind: DocumentKind) => void;
}) {
  const kind = requirement.kind;
  return (
    <div className="rounded-[24px] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-soft)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            {requirement.label}
            {requirement.mandatory ? null : (
              <span className="ml-2 text-xs font-normal text-[var(--color-ink-muted)]">
                optional
              </span>
            )}
          </p>
          <p className="text-sm text-[var(--color-ink-subtle)]">
            {requirement.description}
          </p>
        </div>
        {document ? <Badge tone="success">Uploaded</Badge> : null}
      </div>

      {document ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
          <div>
            <p className="text-sm font-medium text-[var(--color-ink)]">
              {document.fileName}
            </p>
            <p className="text-xs text-[var(--color-ink-muted)]">
              {document.fileType} • {formatBytes(document.fileSize)}
            </p>
          </div>
          <Button
            variant="ghost"
            type="button"
            onClick={() => onRemove(kind)}
            className="px-3"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <label className="mt-4 flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white px-6 py-8 text-center">
          <Upload className="h-5 w-5 text-[var(--color-primary)]" />
          <span className="text-sm font-medium text-[var(--color-ink)]">
            Drag and drop or browse
          </span>
          <span className="text-xs text-[var(--color-ink-muted)]">
            Accepted formats: PDF, JPG, PNG
          </span>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onFileChange(requirement, file);
              }
              event.target.value = "";
            }}
          />
        </label>
      )}

      {uploading?.documentCode === requirement.code ? (
        <div className="mt-4 space-y-2">
          <div className="h-2 rounded-full bg-white">
            <div
              className="h-2 rounded-full bg-[var(--color-primary)] transition-all"
              style={{ width: `${uploading.progress}%` }}
            />
          </div>
          <p className="text-xs text-[var(--color-ink-muted)]">
            Uploading {uploading.progress}%
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function DocumentUploader({
  pack,
  documents,
  uploading,
  busy,
  onFileChange,
  onRemove,
  onUseDemoDocuments,
  onContinue,
}: {
  pack: IndustryPack;
  documents: DocumentView[];
  uploading?: UploadingState | null;
  busy?: boolean;
  onFileChange: (requirement: DocumentRequirement, file: File) => void;
  onRemove: (kind: DocumentKind) => void;
  onUseDemoDocuments: () => void;
  onContinue: () => void;
}) {
  // Each industry asks for its own evidence: a bank wants incorporation and a
  // tax certificate, an insurer wants a proposal and a surveyor's
  // questionnaire. Rendering a fixed identity/address pair asked every
  // industry for the bank's documents.
  const profile = pack.documentProfile;

  return (
    <Card className="space-y-6">
      <SectionTitle
        title="Documents"
        description={`Upload the evidence required for your ${pack.brand.productName}, or continue with the sample pack in this environment.`}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {profile.map((requirement) => (
          <DocSlot
            key={requirement.code}
            requirement={requirement}
            document={documents.find((item) => item.documentCode === requirement.code)}
            uploading={uploading}
            onFileChange={onFileChange}
            onRemove={onRemove}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy} type="button" variant="secondary" onClick={onUseDemoDocuments}>
          Use sample documents
        </Button>
        <Button
          disabled={busy || documents.length === 0}
          type="button"
          onClick={onContinue}
        >
          Continue
        </Button>
        <p className="text-sm text-[var(--color-ink-subtle)]">
          {documents.length > 0
            ? "Continue when you are ready to submit these attachments for verification."
            : "Upload at least one document to enable Continue, or use the sample pack."}
        </p>
      </div>
    </Card>
  );
}
