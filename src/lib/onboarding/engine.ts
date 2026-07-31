import fs from "node:fs";
import path from "node:path";

import {
  BRAND,
  CASE_PROGRESS_STEPS,
  CONSENT_TEXT,
  CUSTOMER_SAFE_STATUS,
  DEMO_CUSTOMER,
  DOCUMENT_MISMATCH_ADDRESS,
  MODE_OPTIONS,
  PRODUCT_RECOMMENDATION_MESSAGE,
  SCENARIO_OPTIONS,
  START_ASSISTANT_ACTION,
  TIMEOUT_ALERT,
} from "@/lib/onboarding/constants";
import {
  applicantSchema,
  confirmAddressSchema,
  consentSchema,
  validateDocumentFileType,
} from "@/lib/onboarding/schemas";
import type {
  AssistantMessage,
  CreateOnboardingCaseRequest,
  CreateOnboardingCaseResponse,
  DemoExecutionEvent,
  DemoSettings,
  DemoSnapshot,
  DocumentUploadResponse,
  DocumentView,
  InternalOnboardingCase,
  OnboardingAction,
  OnboardingCaseView,
  OnboardingStatus,
  OrchestrationMode,
  ScenarioId,
  SubmitCaseActionRequest,
  UploadedDocument,
} from "@/lib/onboarding/types";

type AssistantMessageInput =
  | Omit<Extract<AssistantMessage, { type: "text" }>, "id" | "createdAt">
  | Omit<Extract<AssistantMessage, { type: "choice" }>, "id" | "createdAt">
  | Omit<Extract<AssistantMessage, { type: "status" }>, "id" | "createdAt">;

const STORE_DIR = path.join(process.cwd(), ".demo-data");
const STORE_FILE = path.join(STORE_DIR, "northstar-demo-store.json");

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

class EngineError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class CaseNotFoundError extends EngineError {
  constructor(caseId: string) {
    super(`Case ${caseId} was not found.`, 404);
  }
}

export class CaseVersionConflictError extends EngineError {
  constructor() {
    super("This application changed in another session. Refresh and try again.", 409);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function delayElapsed(startedAt: string | undefined, ms: number) {
  if (!startedAt) {
    return false;
  }

  return Date.now() - new Date(startedAt).getTime() >= ms;
}

function nextCaseId(snapshot: DemoSnapshot) {
  return `ONB-${String(10027 + snapshot.cases.length).padStart(5, "0")}`;
}

function defaultSettings(): DemoSettings {
  return {
    orchestrationMode:
      (process.env.ORCHESTRATION_MODE as OrchestrationMode | undefined) ||
      "mock-pega",
    scenarioId:
      (process.env.DEMO_SCENARIO as ScenarioId | undefined) ||
      "ADDRESS_PEP_REVIEW",
    demoControlEnabled: process.env.DEMO_CONTROL_ENABLED !== "false",
  };
}

function ensureStore() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }

  if (!fs.existsSync(STORE_FILE)) {
    const snapshot: DemoSnapshot = {
      settings: defaultSettings(),
      cases: [],
    };

    fs.writeFileSync(STORE_FILE, JSON.stringify(snapshot, null, 2));
  }
}

function readStore(): DemoSnapshot {
  ensureStore();
  return JSON.parse(fs.readFileSync(STORE_FILE, "utf8")) as DemoSnapshot;
}

function writeStore(snapshot: DemoSnapshot) {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(snapshot, null, 2));
}

function withStore<T>(updater: (snapshot: DemoSnapshot) => T): T {
  const snapshot = readStore();
  const result = updater(snapshot);
  writeStore(snapshot);
  return result;
}

function pushMessage(
  caseRecord: InternalOnboardingCase,
  message: AssistantMessageInput,
) {
  caseRecord.assistantMessages.push({
    ...message,
    id: `${caseRecord.caseId}-msg-${caseRecord.assistantMessages.length + 1}`,
    createdAt: nowIso(),
  } as AssistantMessage);
}

function pushEvent(
  caseRecord: InternalOnboardingCase,
  event: Omit<DemoExecutionEvent, "id" | "timestamp" | "caseId" | "correlationId">,
) {
  caseRecord.events.push({
    ...event,
    id: `${caseRecord.caseId}-evt-${caseRecord.events.length + 1}`,
    timestamp: nowIso(),
    caseId: caseRecord.caseId,
    correlationId: caseRecord.correlationId,
  });
}

function setStatus(
  caseRecord: InternalOnboardingCase,
  status: OnboardingStatus,
  details?: {
    alert?: InternalOnboardingCase["alert"];
    statusMessage?: string;
    event?:
      | Omit<DemoExecutionEvent, "id" | "timestamp" | "caseId" | "correlationId">
      | undefined;
  },
) {
  if (caseRecord.status === status && !details?.alert) {
    return;
  }

  caseRecord.status = status;
  caseRecord.customerSafeStatus = CUSTOMER_SAFE_STATUS[status];
  caseRecord.alert = details?.alert;
  caseRecord.caseVersion += 1;
  caseRecord.lastUpdatedAt = nowIso();

  if (details?.statusMessage) {
    pushMessage(caseRecord, {
      type: "status",
      role: "system",
      content: details.statusMessage,
      status:
        status === "UNABLE_TO_CONTINUE"
          ? "error"
          : status === "ROUTINE_REVIEW"
            ? "warning"
            : "info",
    });
  }

  if (details?.event) {
    pushEvent(caseRecord, details.event);
  }
}

function currentActionForCase(
  caseRecord: InternalOnboardingCase,
): OnboardingAction | undefined {
  if (caseRecord.status === "STARTED") {
    return START_ASSISTANT_ACTION;
  }

  if (caseRecord.status === "INFORMATION_REQUIRED" && !caseRecord.applicant) {
    return {
      id: "SUBMIT_DETAILS",
      label: "Save and continue",
      description: "Submit the core customer information.",
    };
  }

  if (caseRecord.status === "INFORMATION_REQUIRED" && caseRecord.applicant) {
    return {
      id: "ACCEPT_CONSENT",
      label: "Continue",
      description: "Capture the fictional consent acknowledgement.",
    };
  }

  if (caseRecord.status === "DOCUMENTS_REQUIRED") {
    return {
      id: "UPLOAD_DOCUMENTS",
      label: "Upload documents",
      description: "Upload or apply the bundled fictional demo documents.",
    };
  }

  if (caseRecord.status === "ADDRESS_CONFIRMATION_REQUIRED") {
    return {
      id: "CONFIRM_ADDRESS",
      label: "Confirm address",
      description: "Confirm which address should be used for the application.",
    };
  }

  if (caseRecord.status === "ROUTINE_REVIEW") {
    return {
      id: "CHECK_STATUS",
      label: "Check status",
      description: "Refresh the latest customer-safe onboarding status.",
    };
  }

  return undefined;
}

function buildProgress(status: OnboardingStatus) {
  return {
    currentStep: PROGRESS_INDEX[status],
    steps: CASE_PROGRESS_STEPS.map((step, index) => {
      const currentIndex = PROGRESS_INDEX[status];
      let state: OnboardingCaseView["progress"]["steps"][number]["state"] =
        "not-started";

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

      return {
        id: step.id,
        label: step.label,
        state,
      };
    }),
  };
}

function viewFromCase(caseRecord: InternalOnboardingCase): OnboardingCaseView {
  return {
    caseId: caseRecord.caseId,
    caseVersion: caseRecord.caseVersion,
    correlationId: caseRecord.correlationId,
    orchestrationMode: caseRecord.orchestrationMode,
    scenarioId: caseRecord.scenarioId,
    status: caseRecord.status,
    customerSafeStatus: caseRecord.customerSafeStatus,
    currentAction: currentActionForCase(caseRecord),
    progress: buildProgress(caseRecord.status),
    applicant: caseRecord.applicant,
    documents: caseRecord.documents,
    assistantMessages: caseRecord.assistantMessages,
    lastUpdatedAt: caseRecord.lastUpdatedAt,
    outcome: caseRecord.outcome,
    alert: caseRecord.alert,
    statusDetail:
      caseRecord.status === "ROUTINE_REVIEW"
        ? "One of our onboarding specialists needs to complete a routine review."
        : undefined,
  };
}

function requireCase(snapshot: DemoSnapshot, caseId: string) {
  const caseRecord = snapshot.cases.find((item) => item.caseId === caseId);

  if (!caseRecord) {
    throw new CaseNotFoundError(caseId);
  }

  return caseRecord;
}

function beginVerification(caseRecord: InternalOnboardingCase) {
  caseRecord.verificationStartedAt = nowIso();
  setStatus(caseRecord, "VERIFYING_DOCUMENTS", {
    statusMessage: "Document processing has started.",
    event: {
      category: "TOOL",
      displayName: "Document analysis requested",
      status: "STARTED",
      summary: "Submitted fictional identity and address evidence for analysis.",
    },
  });
}

function beginScreening(caseRecord: InternalOnboardingCase) {
  caseRecord.screeningStartedAt = nowIso();
  setStatus(caseRecord, "SCREENING_IN_PROGRESS", {
    statusMessage: "Identity and screening checks are now in progress.",
    event: {
      category: "RULE",
      displayName: "Screening requested",
      status: "STARTED",
      summary: "Running identity and customer screening checks.",
    },
  });
}

function beginCustomerCreation(caseRecord: InternalOnboardingCase) {
  caseRecord.customerCreationStartedAt = nowIso();
  setStatus(caseRecord, "CREATING_CUSTOMER", {
    statusMessage: "Final account setup is underway.",
    event: {
      category: "INTEGRATION",
      displayName: "Customer creation requested",
      status: "STARTED",
      summary: "Preparing fictional customer and account records.",
    },
  });
}

function completeCase(caseRecord: InternalOnboardingCase) {
  caseRecord.outcome = {
    customerReference: "CUST-100482",
    accountReference: "ACC-DEMO-29814",
    productName: BRAND.productName,
  };
  setStatus(caseRecord, "COMPLETED", {
    statusMessage: `Welcome to ${BRAND.bankName}. Your ${BRAND.productName} has been opened successfully.`,
    event: {
      category: "CASE",
      displayName: "Onboarding completed",
      status: "SUCCEEDED",
      summary: "The deterministic onboarding scenario completed successfully.",
    },
  });
}

function failCase(caseRecord: InternalOnboardingCase) {
  setStatus(caseRecord, "UNABLE_TO_CONTINUE", {
    alert: TIMEOUT_ALERT,
    statusMessage: TIMEOUT_ALERT.message,
    event: {
      category: "TOOL",
      displayName: "Verification timeout",
      status: "FAILED",
      summary: "A simulated timeout was raised for the customer-safe error path.",
    },
  });
}

function materializeCase(caseRecord: InternalOnboardingCase) {
  if (caseRecord.status === "VERIFYING_DOCUMENTS") {
    if (caseRecord.forcedTimeout) {
      failCase(caseRecord);
      return caseRecord;
    }

    if (delayElapsed(caseRecord.verificationStartedAt, 2600)) {
      if (caseRecord.scenarioId === "ADDRESS_PEP_REVIEW") {
        setStatus(caseRecord, "ADDRESS_CONFIRMATION_REQUIRED", {
          statusMessage:
            "We found a difference in the residential address and need you to confirm which one to use.",
          event: {
            category: "RULE",
            displayName: "Address mismatch returned",
            status: "SUCCEEDED",
            summary:
              "The uploaded proof of address differs from the application address.",
            technicalDetails: {
              applicationAddress: DEMO_CUSTOMER.addressLine1,
              documentAddress: DOCUMENT_MISMATCH_ADDRESS,
            },
          },
        });
      } else {
        beginScreening(caseRecord);
      }
    }
  }

  if (caseRecord.status === "SCREENING_IN_PROGRESS") {
    if (caseRecord.forcedTimeout || caseRecord.scenarioId === "SERVICE_TIMEOUT") {
      if (delayElapsed(caseRecord.screeningStartedAt, 3800)) {
        failCase(caseRecord);
      }

      return caseRecord;
    }

    if (delayElapsed(caseRecord.screeningStartedAt, 4200)) {
      if (caseRecord.scenarioId === "ADDRESS_PEP_REVIEW") {
        setStatus(caseRecord, "ROUTINE_REVIEW", {
          statusMessage:
            "One of our onboarding specialists needs to complete a routine review.",
          event: {
            category: "HUMAN",
            displayName: "Human review required",
            status: "WAITING",
            summary:
              "A customer-safe review hold has been placed on the onboarding case.",
          },
        });
      } else {
        beginCustomerCreation(caseRecord);
      }
    }
  }

  if (caseRecord.status === "ROUTINE_REVIEW" && caseRecord.reviewClearedAt) {
    pushEvent(caseRecord, {
      category: "HUMAN",
      displayName: "Review completed",
      status: "SUCCEEDED",
      summary: "The simulated operations review was cleared by the presenter.",
    });
    beginCustomerCreation(caseRecord);
  }

  if (
    caseRecord.status === "CREATING_CUSTOMER" &&
    delayElapsed(caseRecord.customerCreationStartedAt, 2000)
  ) {
    completeCase(caseRecord);
  }

  return caseRecord;
}

function initialAssistantMessages(): AssistantMessage[] {
  const createdAt = nowIso();
  return [
    {
      type: "text",
      id: "msg-1",
      role: "customer",
      content: "I want to open an account for my salary and everyday expenses.",
      createdAt,
    },
    {
      type: "choice",
      id: "msg-2",
      role: "assistant",
      content: PRODUCT_RECOMMENDATION_MESSAGE,
      choices: [
        { id: "choice-1", label: "Review account", actionId: "REVIEW_ACCOUNT" },
        { id: "choice-2", label: "Begin application", actionId: "BEGIN_APPLICATION" },
      ],
      createdAt,
    },
  ];
}

function newCase(
  request: CreateOnboardingCaseRequest,
  mode: OrchestrationMode,
  caseId: string,
): InternalOnboardingCase {
  const createdAt = nowIso();

  return {
    caseId,
    caseVersion: 1,
    correlationId: `corr-${caseId}-01`,
    orchestrationMode: mode,
    scenarioId: request.scenarioId,
    status: "STARTED",
    customerSafeStatus: CUSTOMER_SAFE_STATUS.STARTED,
    createdAt,
    lastUpdatedAt: createdAt,
    documents: [],
    assistantMessages: initialAssistantMessages(),
    events: [
      {
        id: `${caseId}-evt-1`,
        caseId,
        correlationId: `corr-${caseId}-01`,
        timestamp: createdAt,
        category: "CASE",
        displayName: "Onboarding request accepted",
        status: "SUCCEEDED",
        summary: "Accepted the public website request for a new onboarding case.",
      },
      {
        id: `${caseId}-evt-2`,
        caseId,
        correlationId: `corr-${caseId}-01`,
        timestamp: createdAt,
        category: "AGENT",
        displayName: "Fixed product recommendation",
        status: "SUCCEEDED",
        summary:
          "Returned the Everyday Plus Account from the curated product catalogue.",
      },
      {
        id: `${caseId}-evt-3`,
        caseId,
        correlationId: `corr-${caseId}-01`,
        timestamp: createdAt,
        category: "CASE",
        displayName: "Case created",
        status: "SUCCEEDED",
        summary: `Created onboarding case ${caseId} in ${mode} mode.`,
      },
    ],
  };
}

export function getDemoSettings() {
  return readStore().settings;
}

export function getScenarioOptions() {
  return SCENARIO_OPTIONS;
}

export function getModeOptions() {
  return MODE_OPTIONS;
}

export function getCurrentCaseView() {
  const snapshot = readStore();
  if (!snapshot.settings.currentCaseId) {
    return null;
  }

  const caseRecord = requireCase(snapshot, snapshot.settings.currentCaseId);
  materializeCase(caseRecord);
  writeStore(snapshot);
  return viewFromCase(caseRecord);
}

export function getCurrentCaseEvents() {
  const snapshot = readStore();
  if (!snapshot.settings.currentCaseId) {
    return [];
  }

  return requireCase(snapshot, snapshot.settings.currentCaseId).events;
}

export function createCaseRecord(
  request: CreateOnboardingCaseRequest,
  mode: OrchestrationMode,
): CreateOnboardingCaseResponse {
  return withStore((snapshot) => {
    const caseId = nextCaseId(snapshot);
    const caseRecord = newCase(request, mode, caseId);
    snapshot.cases.push(caseRecord);
    snapshot.settings.currentCaseId = caseId;
    snapshot.settings.scenarioId = request.scenarioId;
    snapshot.settings.orchestrationMode = mode;

    return {
      caseId,
      caseVersion: caseRecord.caseVersion,
      correlationId: caseRecord.correlationId,
      status: caseRecord.status,
      nextUrl: `/onboarding/${caseId}`,
    };
  });
}

export function fetchCaseView(caseId: string) {
  return withStore((snapshot) => {
    const caseRecord = requireCase(snapshot, caseId);
    materializeCase(caseRecord);
    return viewFromCase(caseRecord);
  });
}

export function fetchCaseEvents(caseId: string) {
  return withStore((snapshot) => {
    const caseRecord = requireCase(snapshot, caseId);
    materializeCase(caseRecord);
    return caseRecord.events;
  });
}

export function getCaseMode(caseId: string) {
  const snapshot = readStore();
  return requireCase(snapshot, caseId).orchestrationMode;
}

function ensureVersion(
  caseRecord: InternalOnboardingCase,
  expectedCaseVersion: number,
) {
  if (caseRecord.caseVersion !== expectedCaseVersion) {
    throw new CaseVersionConflictError();
  }
}

function removeDocumentByKind(caseRecord: InternalOnboardingCase, kind: "IDENTITY" | "ADDRESS") {
  caseRecord.documents = caseRecord.documents.filter((item) => item.kind !== kind);
  caseRecord.caseVersion += 1;
  caseRecord.lastUpdatedAt = nowIso();
}

export function submitCaseAction(caseId: string, request: SubmitCaseActionRequest) {
  return withStore((snapshot) => {
    const caseRecord = requireCase(snapshot, caseId);
    materializeCase(caseRecord);
    ensureVersion(caseRecord, request.expectedCaseVersion);

    switch (request.actionId) {
      case "BEGIN_APPLICATION": {
        setStatus(caseRecord, "INFORMATION_REQUIRED", {
          statusMessage:
            "We have created your onboarding case. Please provide your personal details to continue.",
        });
        caseRecord.lastBackendAction = "BEGIN_APPLICATION";
        break;
      }
      case "SUBMIT_DETAILS": {
        const applicant = applicantSchema.parse(request.data);
        caseRecord.applicant = applicant;
        caseRecord.caseVersion += 1;
        caseRecord.lastUpdatedAt = nowIso();
        caseRecord.lastBackendAction = "SUBMIT_DETAILS";
        pushEvent(caseRecord, {
          category: "CASE",
          displayName: "Customer details submitted",
          status: "SUCCEEDED",
          summary: "Captured the regulated personal and contact information.",
        });
        pushMessage(caseRecord, {
          type: "status",
          role: "system",
          content:
            "Your personal details have been saved. Please review and accept the consent statement to continue.",
          status: "success",
        });
        break;
      }
      case "ACCEPT_CONSENT": {
        const consent = consentSchema.parse(request.data);
        caseRecord.consent = consent;
        caseRecord.caseVersion += 1;
        caseRecord.lastUpdatedAt = nowIso();
        caseRecord.lastBackendAction = "ACCEPT_CONSENT";
        setStatus(caseRecord, "DOCUMENTS_REQUIRED");
        pushEvent(caseRecord, {
          category: "CASE",
          displayName: "Consent captured",
          status: "SUCCEEDED",
          summary: "Stored the fictional consent acknowledgement.",
        });
        break;
      }
      case "CONFIRM_ADDRESS": {
        const confirmation = confirmAddressSchema.parse(request.data);
        if (!caseRecord.applicant) {
          throw new EngineError("Applicant data is required before address confirmation.");
        }

        caseRecord.applicant.addressLine1 = confirmation.selectedAddress;
        caseRecord.caseVersion += 1;
        caseRecord.lastUpdatedAt = nowIso();
        caseRecord.lastBackendAction = "CONFIRM_ADDRESS";
        pushEvent(caseRecord, {
          category: "CASE",
          displayName: "Customer address confirmed",
          status: "SUCCEEDED",
          summary: `The customer confirmed ${confirmation.selectedAddress} as the correct address.`,
        });
        beginScreening(caseRecord);
        break;
      }
      case "USE_DEMO_DOCUMENTS": {
        caseRecord.documents = [
          {
            documentId: `${caseRecord.caseId}-DOC-1`,
            kind: "IDENTITY",
            fileName: "Ananya_Rao_Fictional_Identity.pdf",
            fileType: "application/pdf",
            fileSize: 184320,
            status: "UPLOADED",
            source: "demo",
            evidenceReference: `${caseRecord.caseId}-EV-1`,
          },
          {
            documentId: `${caseRecord.caseId}-DOC-2`,
            kind: "ADDRESS",
            fileName: "Ananya_Rao_Fictional_Utility_Bill.pdf",
            fileType: "application/pdf",
            fileSize: 205401,
            status: "UPLOADED",
            source: "demo",
            evidenceReference: `${caseRecord.caseId}-EV-2`,
          },
        ];
        caseRecord.caseVersion += 1;
        caseRecord.lastUpdatedAt = nowIso();
        caseRecord.lastBackendAction = "USE_DEMO_DOCUMENTS";
        pushEvent(caseRecord, {
          category: "CASE",
          displayName: "Documents received",
          status: "SUCCEEDED",
          summary: "Bundled fictional demo documents were attached to the case.",
        });
        beginVerification(caseRecord);
        break;
      }
      case "REMOVE_IDENTITY_DOCUMENT": {
        removeDocumentByKind(caseRecord, "IDENTITY");
        caseRecord.lastBackendAction = "REMOVE_IDENTITY_DOCUMENT";
        setStatus(caseRecord, "DOCUMENTS_REQUIRED");
        break;
      }
      case "REMOVE_ADDRESS_DOCUMENT": {
        removeDocumentByKind(caseRecord, "ADDRESS");
        caseRecord.lastBackendAction = "REMOVE_ADDRESS_DOCUMENT";
        setStatus(caseRecord, "DOCUMENTS_REQUIRED");
        break;
      }
      default:
        throw new EngineError("The requested action is not supported.", 422);
    }

    materializeCase(caseRecord);
    return viewFromCase(caseRecord);
  });
}

export function saveDocument(caseId: string, document: UploadedDocument): DocumentUploadResponse {
  return withStore((snapshot) => {
    const caseRecord = requireCase(snapshot, caseId);
    materializeCase(caseRecord);

    if (!validateDocumentFileType(document.fileType)) {
      throw new EngineError("Unsupported file type. Use PDF, JPG or PNG.", 422);
    }

    const documentId = `${caseRecord.caseId}-DOC-${caseRecord.documents.length + 1}`;
    const evidenceReference = `${caseRecord.caseId}-EV-${caseRecord.documents.length + 1}`;
    const documentView: DocumentView = {
      documentId,
      kind: document.kind,
      fileName: document.fileName,
      fileType: document.fileType,
      fileSize: document.fileSize,
      status: "UPLOADED",
      source: document.source,
      evidenceReference,
    };

    caseRecord.documents = [
      ...caseRecord.documents.filter((item) => item.kind !== document.kind),
      documentView,
    ];
    caseRecord.caseVersion += 1;
    caseRecord.lastUpdatedAt = nowIso();
    caseRecord.lastBackendAction = `UPLOAD_${document.kind}_DOCUMENT`;

    pushEvent(caseRecord, {
      category: "CASE",
      displayName: "Documents received",
      status: "SUCCEEDED",
      summary: `Received ${document.kind.toLowerCase()} evidence ${document.fileName}.`,
    });

    const hasIdentity = caseRecord.documents.some((item) => item.kind === "IDENTITY");
    const hasAddress = caseRecord.documents.some((item) => item.kind === "ADDRESS");

    if (hasIdentity && hasAddress) {
      beginVerification(caseRecord);
    } else {
      setStatus(caseRecord, "DOCUMENTS_REQUIRED");
    }

    materializeCase(caseRecord);

    return {
      documentId,
      fileName: document.fileName,
      status: "UPLOADED",
      evidenceReference,
    };
  });
}

export function resetCase(caseId: string) {
  return withStore((snapshot) => {
    const caseRecord = requireCase(snapshot, caseId);
    const resetRecord = newCase(
      {
        productCode: "EVERYDAY_PLUS",
        channel: "WEB",
        scenarioId: caseRecord.scenarioId,
      },
      caseRecord.orchestrationMode,
      caseRecord.caseId,
    );
    const index = snapshot.cases.findIndex((item) => item.caseId === caseId);
    snapshot.cases[index] = resetRecord;
    snapshot.settings.currentCaseId = caseId;
    return viewFromCase(resetRecord);
  });
}

export function advanceCase(caseId: string) {
  return withStore((snapshot) => {
    const caseRecord = requireCase(snapshot, caseId);
    if (caseRecord.status === "VERIFYING_DOCUMENTS") {
      caseRecord.verificationStartedAt = new Date(Date.now() - 6000).toISOString();
    } else if (caseRecord.status === "SCREENING_IN_PROGRESS") {
      caseRecord.screeningStartedAt = new Date(Date.now() - 6000).toISOString();
    } else if (caseRecord.status === "CREATING_CUSTOMER") {
      caseRecord.customerCreationStartedAt = new Date(Date.now() - 4000).toISOString();
    }

    caseRecord.lastBackendAction = "ADVANCE_CASE";
    materializeCase(caseRecord);
    return viewFromCase(caseRecord);
  });
}

export function clearReview(caseId: string) {
  return withStore((snapshot) => {
    const caseRecord = requireCase(snapshot, caseId);
    caseRecord.reviewClearedAt = nowIso();
    caseRecord.lastBackendAction = "CLEAR_REVIEW";
    materializeCase(caseRecord);
    return viewFromCase(caseRecord);
  });
}

export function forceTimeout(caseId: string) {
  return withStore((snapshot) => {
    const caseRecord = requireCase(snapshot, caseId);
    caseRecord.forcedTimeout = true;
    caseRecord.lastBackendAction = "FORCE_TIMEOUT";
    if (caseRecord.status === "VERIFYING_DOCUMENTS" || caseRecord.status === "SCREENING_IN_PROGRESS") {
      failCase(caseRecord);
    } else {
      caseRecord.alert = TIMEOUT_ALERT;
    }

    return viewFromCase(caseRecord);
  });
}

export function updateMode(mode: OrchestrationMode) {
  return withStore((snapshot) => {
    snapshot.settings.orchestrationMode = mode;
    return snapshot.settings;
  });
}

export function updateScenario(scenarioId: ScenarioId) {
  return withStore((snapshot) => {
    snapshot.settings.scenarioId = scenarioId;
    return snapshot.settings;
  });
}

export function getConsentText() {
  return CONSENT_TEXT;
}

export function getDemoCustomerTemplate() {
  return DEMO_CUSTOMER;
}

export function serializeError(error: unknown) {
  if (error instanceof EngineError) {
    return { message: error.message, statusCode: error.statusCode };
  }

  if (error instanceof Error) {
    return { message: error.message, statusCode: 500 };
  }

  return { message: "Unexpected error", statusCode: 500 };
}
