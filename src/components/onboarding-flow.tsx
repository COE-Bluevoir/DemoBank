"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { ShieldCheck } from "lucide-react";

import { AssistantPanel } from "@/components/assistant-panel";
import { AddressComparison } from "@/components/address-comparison";
import { CaseReferenceBadge } from "@/components/case-reference-badge";
import { ConsentCard } from "@/components/consent-card";
import { CustomerFormSection } from "@/components/customer-form-section";
import { AlternativeOffer } from "@/components/alternative-offer";
import { DocumentUploader } from "@/components/document-uploader";
import type { DocumentRequirement } from "@/lib/industry/types";
import { ErrorState } from "@/components/error-state";
import { OnboardingShell } from "@/components/onboarding-shell";
import { SuccessSummary } from "@/components/success-summary";
import { RoutineReviewStatus } from "@/components/routine-review-status";
import { VerificationProgress } from "@/components/verification-progress";
import { Badge, Button, Card, SelectInput, TextInput } from "@/components/ui";
import { PhoneNumberInput } from "@/components/phone-number-input";
import { getIndustryPack } from "@/lib/industry/registry";
import type { IndustryPack } from "@/lib/industry/types";
import { applicantSchema } from "@/lib/onboarding/schemas";
import type {
  ApplicantView,
  OnboardingCaseView,
} from "@/lib/onboarding/types";
import { formatDateTime } from "@/lib/onboarding/utils";

function keepDocumentStep(
  previous: OnboardingCaseView,
  next: OnboardingCaseView,
): OnboardingCaseView {
  if (
    next.status === "VERIFYING_DOCUMENTS" ||
    next.status === "SCREENING_IN_PROGRESS" ||
    next.status === "ROUTINE_REVIEW" ||
    next.status === "CREATING_CUSTOMER" ||
    next.status === "COMPLETED"
  ) {
    return next;
  }

  const alreadyCollectingDocuments =
    previous.status === "DOCUMENTS_REQUIRED" ||
    (previous.documents?.length ?? 0) > 0;
  const refreshDroppedToDetails =
    next.status === "INFORMATION_REQUIRED" || next.status === "STARTED";

  if (!alreadyCollectingDocuments || !refreshDroppedToDetails) {
    return next;
  }

  return {
    ...next,
    status: "DOCUMENTS_REQUIRED",
    applicant: next.applicant ?? previous.applicant,
    documents:
      next.documents && next.documents.length > 0
        ? next.documents
        : previous.documents,
  };
}

function ApplicantForm({
  initialValues,
  busy,
  onSubmit,
  pack,
}: {
  initialValues?: ApplicantView;
  busy?: boolean;
  onSubmit: (value: ApplicantView) => void;
  pack: IndustryPack;
}) {
  const form = useForm<ApplicantView>({
    resolver: zodResolver(applicantSchema),
    defaultValues: initialValues,
  });

  useEffect(() => {
    if (initialValues) {
      form.reset(initialValues);
    }
  }, [form, initialValues]);

  // Intake is configuration-driven: which details are collected, what they are
  // called, and which are dropdowns all come from the industry pack.
  const fields = pack.intakeFields;

  return (
    <CustomerFormSection
      title="Personal details"
      description="Capture the regulated customer details with clear labels and repeated server-side validation."
    >
      <form
        className="space-y-6"
        onSubmit={form.handleSubmit((value) => onSubmit(value))}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {fields.map((field) => {
            const error = form.formState.errors[field.key]?.message;

            return field.key === "mobile" ? (
              <div key={field.key} className="space-y-2 text-sm md:col-span-2">
                <span className="font-medium text-[var(--color-ink)]">
                  {field.label}
                </span>
                <Controller
                  name="mobile"
                  control={form.control}
                  render={({ field: mobileField }) => (
                    <PhoneNumberInput
                      name={mobileField.name}
                      value={mobileField.value ?? ""}
                      onBlur={mobileField.onBlur}
                      onChange={mobileField.onChange}
                    />
                  )}
                />
                {error ? (
                  <span className="text-xs text-[var(--color-error)]">{error}</span>
                ) : null}
              </div>
            ) : (
              <label key={field.key} className="space-y-2 text-sm">
                <span className="font-medium text-[var(--color-ink)]">
                  {field.label}
                </span>
                {field.options ? (
                  <SelectInput {...form.register(field.key)}>
                    <option value="">Select</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </SelectInput>
                ) : (
                  <TextInput type={field.type || "text"} {...form.register(field.key)} />
                )}
                {error ? (
                  <span className="text-xs text-[var(--color-error)]">{error}</span>
                ) : null}
              </label>
            );
          })}
        </div>
        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>
            Save and continue
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => form.reset(pack.sampleApplicant)}
          >
            Fill with sample data
          </Button>
        </div>
      </form>
    </CustomerFormSection>
  );
}

export function OnboardingFlow({
  initialCase,
  consentText,
  presenterMode,
}: {
  initialCase: OnboardingCaseView;
  consentText: string;
  presenterMode?: boolean;
}) {
  const [caseData, setCaseData] = useState(initialCase);
  // The case records which configuration pack it was started from, so a
  // resumed journey keeps the right branding and vocabulary.
  const pack = useMemo(
    () => getIndustryPack(caseData.industryId),
    [caseData.industryId],
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<{
    documentCode: string;
    progress: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPresenterPanel, setShowPresenterPanel] = useState(Boolean(presenterMode));
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey && event.key.toLowerCase() === "d") {
        setShowPresenterPanel((value) => !value);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const shouldPoll = useMemo(
    () =>
      [
        "VERIFYING_DOCUMENTS",
        "SCREENING_IN_PROGRESS",
        "ROUTINE_REVIEW",
        "CREATING_CUSTOMER",
      ].includes(caseData.status),
    [caseData.status],
  );

  const refreshCase = useCallback(async () => {
    const response = await fetch(`/api/onboarding/cases/${encodeURIComponent(caseData.caseId)}`, {
      cache: "no-store",
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.message || "Unable to refresh the case.");
      return;
    }

    setCaseData((previous) => keepDocumentStep(previous, payload));
    setError(null);
  }, [caseData.caseId]);

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshCase();
    }, 2200);

    return () => window.clearInterval(interval);
  }, [shouldPoll, caseData.caseId, refreshCase]);

  async function submitAction(actionId: string, data?: Record<string, unknown>) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/onboarding/cases/${encodeURIComponent(caseData.caseId)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId,
          expectedCaseVersion: caseData.caseVersion,
          data,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.message || "Unable to submit the action.");
        if (response.status === 409) {
          await refreshCase();
        }
        return;
      }

      setCaseData(payload);
    } finally {
      setBusy(false);
    }
  }

  async function handleAssistantAction(actionId: string) {
    if (actionId === "REVIEW_ACCOUNT") {
      router.push("/accounts/everyday-plus");
      return;
    }

    if (actionId === "CHECK_STATUS") {
      await refreshCase();
      return;
    }

    await submitAction(actionId);
  }

  async function uploadFile(requirement: DocumentRequirement, file: File) {
    const kind = requirement.kind;

    if (file.size > 5 * 1024 * 1024) {
      setError("Document too large. Keep each upload under 5 MB.");
      return;
    }

    setUploading({ documentCode: requirement.code, progress: 20 });
    setBusy(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("kind", kind);
      formData.set("documentCode", requirement.code);
      formData.set("file", file);

      const response = await fetch(`/api/onboarding/cases/${encodeURIComponent(caseData.caseId)}/documents`, {
        method: "POST",
        body: formData,
      });

      setUploading({ documentCode: requirement.code, progress: 68 });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.message || "Unable to upload the document.");
        return;
      }

      setUploading({ documentCode: requirement.code, progress: 100 });
      setCaseData((previous) => ({
        ...previous,
        status: "DOCUMENTS_REQUIRED",
        documents: [
          ...(previous.documents ?? []).filter(
            (item) => item.documentCode !== requirement.code,
          ),
          {
            documentId: payload.documentId,
            documentCode: requirement.code,
            kind,
            fileName: payload.fileName ?? file.name,
            fileType: file.type,
            fileSize: file.size,
            status: "UPLOADED",
            source: "upload",
            evidenceReference: payload.evidenceReference ?? payload.documentId,
          },
        ],
      }));
      await refreshCase();
    } finally {
      window.setTimeout(() => setUploading(null), 350);
      setBusy(false);
    }
  }

  function renderPrimaryContent() {
    if (caseData.status === "STARTED") {
      return (
        <Card className="space-y-5">
          <Badge tone="info">Stage 1: Product intent</Badge>
          <h2 className="text-3xl font-semibold text-[var(--color-ink)]">
            Start your application
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-[var(--color-ink-subtle)]">
            You can begin through the onboarding assistant or continue directly
            into the regulated data-capture journey.
          </p>
          <div className="flex flex-wrap gap-3">
          <Button type="button" disabled={busy} onClick={() => submitAction("BEGIN_APPLICATION")}>
              Begin application
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/accounts/everyday-plus")}
            >
              Review account
            </Button>
          </div>
        </Card>
      );
    }

    if (caseData.status === "INFORMATION_REQUIRED" && !caseData.applicant) {
      return (
        <ApplicantForm
              pack={pack}
          initialValues={caseData.applicant}
          busy={busy}
          onSubmit={(value) =>
            submitAction("SUBMIT_DETAILS", value as unknown as Record<string, unknown>)
          }
        />
      );
    }

    if (caseData.status === "INFORMATION_REQUIRED" && caseData.applicant) {
      return (
        <ConsentCard
          consentText={consentText}
          busy={busy}
          onSubmit={(value) =>
            submitAction("ACCEPT_CONSENT", value as unknown as Record<string, unknown>)
          }
        />
      );
    }

    if (caseData.status === "DOCUMENTS_REQUIRED") {
      return (
        <DocumentUploader
          pack={pack}
          documents={caseData.documents || []}
          uploading={uploading}
          busy={busy}
          onFileChange={uploadFile}
          onRemove={(kind) =>
            submitAction(
              kind === "IDENTITY"
                ? "REMOVE_IDENTITY_DOCUMENT"
                : "REMOVE_ADDRESS_DOCUMENT",
            )
          }
          onUseDemoDocuments={() => submitAction("USE_DEMO_DOCUMENTS")}
          onContinue={() => submitAction("CONTINUE_DOCUMENTS")}
        />
      );
    }

    if (
      caseData.status === "VERIFYING_DOCUMENTS" ||
      caseData.status === "SCREENING_IN_PROGRESS" ||
      caseData.status === "CREATING_CUSTOMER"
    ) {
      return <VerificationProgress status={caseData.status} />;
    }

    // A commercial alternative and an address mismatch both park the case at
    // the same status, but they ask the customer different questions.
    if (
      caseData.status === "ADDRESS_CONFIRMATION_REQUIRED" &&
      caseData.pendingChoice
    ) {
      return (
        <AlternativeOffer
          caseData={caseData}
          busy={busy}
          onAccept={() => submitAction("ACCEPT_ALTERNATIVE")}
        />
      );
    }

    if (caseData.status === "ADDRESS_CONFIRMATION_REQUIRED") {
      return (
        <AddressComparison
          applicationAddress={caseData.applicant?.addressLine1 || "18 Lake View Road"}
          documentAddress="81 Lake View Road"
          busy={busy}
          onConfirm={(selectedAddress) =>
            submitAction("CONFIRM_ADDRESS", {
              selectedAddress,
              confirmed: true,
            })
          }
        />
      );
    }

    if (caseData.status === "ROUTINE_REVIEW") {
      return (
        <RoutineReviewStatus
          caseId={caseData.caseId}
          status={caseData.customerSafeStatus}
          lastUpdatedAt={caseData.lastUpdatedAt}
          onRefresh={() => refreshCase()}
          busy={busy}
        />
      );
    }

    if (caseData.status === "COMPLETED") {
      return <SuccessSummary caseData={caseData} />;
    }

    if (caseData.status === "UNABLE_TO_CONTINUE") {
      return (
        <ErrorState
          title={caseData.alert?.title || "Unable to continue"}
          message={caseData.alert?.message || "A technical issue occurred."}
          onRetry={() => refreshCase()}
        />
      );
    }

    return null;
  }

  return (
    <OnboardingShell
      caseData={caseData}
      rightRail={
        <>
          <AssistantPanel
            messages={caseData.assistantMessages}
            busy={busy}
            onAction={handleAssistantAction}
          />
          {showPresenterPanel ? (
            <Card className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-navy)] text-white">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-ink)]">
                    Presenter activity panel
                  </p>
                  <p className="text-sm text-[var(--color-ink-subtle)]">
                    Hidden technical context activated via query param or
                    <span className="font-medium"> Shift + D</span>.
                  </p>
                </div>
              </div>
              <div className="grid gap-3">
                <CaseReferenceBadge
                  label="Case ID"
                  value={caseData.displayReference ?? caseData.caseId}
                />
                <CaseReferenceBadge
                  label="Version"
                  value={String(caseData.caseVersion)}
                />
                <CaseReferenceBadge
                  label="Correlation ID"
                  value={caseData.correlationId}
                />
                <CaseReferenceBadge
                  label="Mode"
                  value={caseData.orchestrationMode}
                />
                <CaseReferenceBadge
                  label="Last updated"
                  value={formatDateTime(caseData.lastUpdatedAt)}
                />
              </div>
            </Card>
          ) : null}
        </>
      }
    >
      {error ? (
        <ErrorState title="Action not completed" message={error} onRetry={() => refreshCase()} />
      ) : null}
      {renderPrimaryContent()}
    </OnboardingShell>
  );
}
