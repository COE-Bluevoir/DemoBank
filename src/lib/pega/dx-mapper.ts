import { BRAND, CASE_PROGRESS_STEPS, CUSTOMER_SAFE_STATUS } from "@/lib/onboarding/constants";
import type {
  DocumentView,
  OnboardingAction,
  OnboardingCaseView,
  OnboardingStatus,
  ProgressState,
  ScenarioId,
} from "@/lib/onboarding/types";
import type { DxCaseInfo } from "@/lib/pega/dx-schemas";

/**
 * Translation from Pega DX v2 into the normalized website model.
 *
 * Pega owns the case lifecycle; this module owns the vocabulary crossing.
 * Two rules:
 *   1. mapping is table-driven, never inferred from prose or work notes
 *   2. nothing internal (screening semantics, operator IDs, provider names)
 *      reaches a customer-facing field
 */

/**
 * Stage name → normalized status.
 *
 * Keyed on the stage *name* because that is what the case designer controls
 * and what remains meaningful if stage IDs are reordered. Matching is
 * case- and whitespace-insensitive.
 */
const STATUS_BY_STAGE_NAME: Record<string, OnboardingStatus> = {
  intake: "STARTED",
  initiate: "STARTED",
  "capture details": "INFORMATION_REQUIRED",
  "customer details": "INFORMATION_REQUIRED",
  documents: "DOCUMENTS_REQUIRED",
  "collect documents": "DOCUMENTS_REQUIRED",
  "verify identity": "VERIFYING_DOCUMENTS",
  "verify documents": "VERIFYING_DOCUMENTS",
  "perform screening": "SCREENING_IN_PROGRESS",
  screening: "SCREENING_IN_PROGRESS",
  "resolve exceptions": "ROUTINE_REVIEW",
  "create customer": "CREATING_CUSTOMER",
  complete: "COMPLETED",
  // Alternate stages.
  "pending information": "INFORMATION_REQUIRED",
  "pending review": "ROUTINE_REVIEW",
  declined: "UNABLE_TO_CONTINUE",
  withdrawn: "UNABLE_TO_CONTINUE",
  "approval rejection": "UNABLE_TO_CONTINUE",
};

/** Fallback when a stage name is unrecognised, keyed on Pega's stage ID. */
const STATUS_BY_STAGE_ID: Record<string, OnboardingStatus> = {
  PRIM0: "STARTED",
  PRIM1: "INFORMATION_REQUIRED",
  PRIM2: "VERIFYING_DOCUMENTS",
  PRIM3: "SCREENING_IN_PROGRESS",
  PRIM4: "ROUTINE_REVIEW",
  PRIM5: "CREATING_CUSTOMER",
  PRIM6: "COMPLETED",
};

const PROGRESS_INDEX: Record<OnboardingStatus, number> = {
  STARTED: 0,
  INFORMATION_REQUIRED: 0,
  DOCUMENTS_REQUIRED: 1,
  VERIFYING_DOCUMENTS: 2,
  ADDRESS_CONFIRMATION_REQUIRED: 2,
  SCREENING_IN_PROGRESS: 2,
  ROUTINE_REVIEW: 3,
  CREATING_CUSTOMER: 4,
  COMPLETED: 4,
  UNABLE_TO_CONTINUE: 3,
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Read a string field from Pega case content, tolerating absent keys. */
function contentString(
  content: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = content?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function nestedContent(
  content: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = content?.[key];
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Resolve the customer-facing status.
 *
 * Pega's resolved work statuses are authoritative when present, because a
 * resolved case must never be shown as still in progress.
 */
export function mapDxStatus(caseInfo: DxCaseInfo): OnboardingStatus {
  const workStatus = normalize(caseInfo.status ?? "");

  if (workStatus.startsWith("resolved-")) {
    return workStatus.includes("completed") || workStatus.includes("customer")
      ? "COMPLETED"
      : "UNABLE_TO_CONTINUE";
  }

  const stageName = normalize(caseInfo.stageLabel ?? activeStageName(caseInfo) ?? "");
  const stageStatus =
    STATUS_BY_STAGE_NAME[stageName] ??
    STATUS_BY_STAGE_ID[caseInfo.stageID ?? ""] ??
    "STARTED";

  // A verification stage normally means "please wait". If Pega has an open
  // assignment asking for a document, the customer has something to do, so the
  // uploader must be shown instead of a progress indicator.
  if (awaitsDocumentUpload(caseInfo)) {
    return "DOCUMENTS_REQUIRED";
  }

  // Likewise, an open assignment asking for details or consent means the
  // customer must supply information, whatever stage it happens to sit in.
  // Pega may sequence consent earlier than the website presents it.
  if (stageStatus === "STARTED" && awaitsCustomerInput(caseInfo)) {
    return "INFORMATION_REQUIRED";
  }

  return stageStatus;
}

function assignmentLabel(caseInfo: DxCaseInfo): string {
  const assignment = caseInfo.assignments?.[0];

  if (!assignment) {
    return "";
  }

  return normalize(`${assignment.name ?? ""} ${assignment.actions?.[0]?.ID ?? ""}`);
}

/** True when Pega is waiting on information only the customer can give. */
function awaitsCustomerInput(caseInfo: DxCaseInfo): boolean {
  return /consent|collect|capture|detail|address|employment|contact/.test(
    assignmentLabel(caseInfo),
  );
}

/** True when the open assignment is asking the customer for a document. */
function awaitsDocumentUpload(caseInfo: DxCaseInfo): boolean {
  return /upload|attach|provide document|submit document/.test(
    assignmentLabel(caseInfo),
  );
}

function activeStageName(caseInfo: DxCaseInfo): string | undefined {
  return caseInfo.stages?.find((stage) => stage.visited_status === "active")?.name;
}

/**
 * Progress is derived from Pega's own stage list where possible, so the
 * customer sees movement that matches the real case lifecycle.
 */
function buildProgress(status: OnboardingStatus) {
  const currentIndex = PROGRESS_INDEX[status];

  return {
    currentStep: currentIndex,
    steps: CASE_PROGRESS_STEPS.map((step, index) => {
      let state: ProgressState = "not-started";

      if (status === "UNABLE_TO_CONTINUE" && index === currentIndex) {
        state = "attention";
      } else if (
        status === "ADDRESS_CONFIRMATION_REQUIRED" &&
        step.id === "verification"
      ) {
        state = "attention";
      } else if (index < currentIndex) {
        state = "completed";
      } else if (index === currentIndex) {
        state = status === "COMPLETED" ? "completed" : "current";
      }

      return { id: step.id, label: step.label, state };
    }),
  };
}

/**
 * The next thing the customer can do.
 *
 * Derived from Pega's open assignment so the website never invents a step the
 * case is not actually waiting on. Assignment names are internal, so the label
 * is taken from a customer-safe table rather than echoed.
 */
const CUSTOMER_SAFE_ACTION_LABEL: Record<OnboardingStatus, string | undefined> = {
  STARTED: "Begin application",
  INFORMATION_REQUIRED: "Save and continue",
  DOCUMENTS_REQUIRED: "Upload documents",
  ADDRESS_CONFIRMATION_REQUIRED: "Confirm address",
  VERIFYING_DOCUMENTS: undefined,
  SCREENING_IN_PROGRESS: undefined,
  ROUTINE_REVIEW: "Check status",
  CREATING_CUSTOMER: undefined,
  COMPLETED: undefined,
  UNABLE_TO_CONTINUE: undefined,
};

function buildCurrentAction(
  caseInfo: DxCaseInfo,
  status: OnboardingStatus,
): OnboardingAction | undefined {
  const label = CUSTOMER_SAFE_ACTION_LABEL[status];

  if (!label) {
    return undefined;
  }

  const assignment = caseInfo.assignments?.[0];
  const flowAction = assignment?.actions?.[0];

  return {
    // The Pega flow-action ID is what the adapter submits back.
    id: flowAction?.ID ?? status,
    label,
    description: "",
  };
}

function mapDocuments(caseInfo: DxCaseInfo): DocumentView[] | undefined {
  const documents = caseInfo.content?.Documents;

  if (!Array.isArray(documents)) {
    return undefined;
  }

  return documents.flatMap((entry): DocumentView[] => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const record = entry as Record<string, unknown>;
    const kind = record.Kind === "ADDRESS" ? "ADDRESS" : "IDENTITY";

    return [
      {
        documentId: String(record.DocumentID ?? record.pyGUID ?? ""),
        kind,
        fileName: String(record.FileName ?? ""),
        fileType: String(record.FileType ?? ""),
        fileSize: Number(record.FileSize ?? 0),
        status: "UPLOADED",
        source: "upload",
        evidenceReference: String(record.EvidenceReference ?? ""),
        storageReference: contentString(record, "StorageReference"),
      },
    ];
  });
}

/**
 * Extract the applicant, if the case content carries one.
 *
 * Returns `undefined` rather than a half-populated object, so the UI keeps
 * showing the capture form until Pega actually holds the details.
 */
function mapApplicant(caseInfo: DxCaseInfo): OnboardingCaseView["applicant"] {
  const applicant = nestedContent(caseInfo.content, "Applicant");
  const address = nestedContent(caseInfo.content, "Address");

  const fullName =
    contentString(applicant, "ApplicantName") ??
    contentString(caseInfo.content, "CustomerOnboardingName");

  if (!fullName) {
    return undefined;
  }

  return {
    fullName,
    dateOfBirth: contentString(applicant, "DateOfBirth") ?? "",
    nationality: contentString(applicant, "Nationality") ?? "",
    mobile: contentString(applicant, "Mobile") ?? "",
    email: contentString(applicant, "Email") ?? "",
    addressLine1:
      contentString(address, "AddressLine1") ??
      contentString(address, "AddressName") ??
      "",
    city: contentString(address, "City") ?? "",
    region: contentString(address, "Region") ?? "",
    postalCode: contentString(address, "PostalCode") ?? "",
    country: contentString(address, "Country") ?? "",
    employmentStatus: contentString(applicant, "EmploymentStatus") ?? "",
    incomeRange: contentString(applicant, "IncomeRange") ?? "",
    taxResidency: contentString(applicant, "TaxResidency") ?? "",
  };
}

/**
 * Applicant details captured by the website this session.
 *
 * Used only when Pega's own content does not yet carry them, so the customer
 * is never asked twice for the same information.
 */
function collectedApplicant(
  collected: Record<string, unknown> | undefined,
): OnboardingCaseView["applicant"] {
  const fullName = collected?.fullName;

  if (typeof fullName !== "string" || fullName.trim().length === 0) {
    return undefined;
  }

  const value = (key: string) =>
    typeof collected?.[key] === "string" ? (collected[key] as string) : "";

  return {
    fullName,
    dateOfBirth: value("dateOfBirth"),
    nationality: value("nationality"),
    mobile: value("mobile"),
    email: value("email"),
    addressLine1: value("addressLine1"),
    city: value("city"),
    region: value("region"),
    postalCode: value("postalCode"),
    country: value("country"),
    employmentStatus: value("employmentStatus"),
    incomeRange: value("incomeRange"),
    taxResidency: value("taxResidency"),
  };
}

function mapOutcome(caseInfo: DxCaseInfo): OnboardingCaseView["outcome"] {
  const customerReference = contentString(caseInfo.content, "CustomerID");
  const accountReference = contentString(caseInfo.content, "AccountID");

  if (!customerReference || !accountReference) {
    return undefined;
  }

  return {
    customerReference,
    accountReference,
    productName:
      contentString(caseInfo.content, "ProductIntent") ?? BRAND.productName,
  };
}

/**
 * Convert a DX v2 case into the model the browser consumes.
 *
 * `caseVersion` has no DX equivalent; Pega uses an `eTag` for concurrency, so
 * the caller supplies a monotonic version derived from it.
 */
export function mapDxCaseToView(
  caseInfo: DxCaseInfo,
  context: {
    scenarioId: ScenarioId;
    caseVersion: number;
    correlationId: string;
    /**
     * What the customer has already entered in this session.
     *
     * Pega's data model may hold only a subset of it, and the website
     * sequences its steps differently from Pega's flow, so the journey must
     * not re-ask for details the customer has already given.
     */
    collected?: Record<string, unknown>;
  },
): OnboardingCaseView {
  const status = mapDxStatus(caseInfo);

  return {
    caseId: caseInfo.ID,
    caseVersion: context.caseVersion,
    correlationId: context.correlationId,
    orchestrationMode: "pega",
    scenarioId: context.scenarioId,
    status,
    customerSafeStatus: CUSTOMER_SAFE_STATUS[status],
    currentAction: buildCurrentAction(caseInfo, status),
    progress: buildProgress(status),
    applicant: mapApplicant(caseInfo) ?? collectedApplicant(context.collected),
    documents: mapDocuments(caseInfo),
    // Pega drives the journey; conversational messages are a mock-mode concept
    // and are intentionally not synthesised from case data.
    assistantMessages: [],
    lastUpdatedAt: caseInfo.lastUpdateTime ?? new Date().toISOString(),
    outcome: mapOutcome(caseInfo),
    statusDetail:
      status === "ROUTINE_REVIEW"
        ? "One of our onboarding specialists needs to complete a routine review."
        : undefined,
  };
}

/** The open assignment the website should act on, if any. */
export function primaryAssignment(caseInfo: DxCaseInfo) {
  return caseInfo.assignments?.[0];
}
