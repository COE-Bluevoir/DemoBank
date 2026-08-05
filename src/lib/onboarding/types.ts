import type { IndustryId } from "@/lib/industry/types";

export type OrchestrationMode = "mock-pega" | "pega" | "non-pega";

export type ScenarioId =
  | "ADDRESS_PEP_REVIEW"
  | "HAPPY_PATH"
  | "SERVICE_TIMEOUT";

export type OnboardingStatus =
  | "STARTED"
  | "INFORMATION_REQUIRED"
  | "DOCUMENTS_REQUIRED"
  | "VERIFYING_DOCUMENTS"
  | "ADDRESS_CONFIRMATION_REQUIRED"
  | "SCREENING_IN_PROGRESS"
  | "ROUTINE_REVIEW"
  | "CREATING_CUSTOMER"
  | "COMPLETED"
  | "UNABLE_TO_CONTINUE";

export type ProgressState =
  | "not-started"
  | "current"
  | "completed"
  | "attention";

export type DocumentKind = "IDENTITY" | "ADDRESS";

export type DocumentStatus = "UPLOADED" | "VERIFIED" | "REQUIRES_ACTION";

export interface ApplicantView {
  /**
   * Captured separately from the last name. Pega stores the two as a single
   * `ApplicantName`, so they are composed at the adapter boundary.
   */
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  mobile: string;
  email: string;
  addressLine1: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  employmentStatus: string;
  incomeRange: string;
  taxResidency: string;
}

export interface ConsentView {
  accepted: boolean;
  timestamp: string;
  textVersion: string;
  channel: string;
}

export interface DocumentView {
  documentId: string;
  kind: DocumentKind;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: DocumentStatus;
  source: "upload" | "demo";
  evidenceReference: string;
  /**
   * Opaque handle to the stored binary. Present for real uploads only; the
   * orchestration layer uses it to retrieve content and must never receive
   * the file bytes through the browser.
   */
  storageReference?: string;
}

export type AssistantMessage =
  | {
      type: "text";
      id: string;
      role: "assistant" | "customer";
      content: string;
      createdAt: string;
    }
  | {
      type: "choice";
      id: string;
      role: "assistant";
      content: string;
      choices: Array<{
        id: string;
        label: string;
        actionId: string;
      }>;
      createdAt: string;
    }
  | {
      type: "status";
      id: string;
      role: "system";
      content: string;
      status: "info" | "success" | "warning" | "error";
      createdAt: string;
    };

export interface OnboardingAction {
  id: string;
  label: string;
  description: string;
}

export interface CustomerAlert {
  title: string;
  message: string;
  tone: "info" | "warning" | "error";
}

export interface OnboardingCaseView {
  caseId: string;
  caseVersion: number;
  correlationId: string;
  orchestrationMode: OrchestrationMode;
  scenarioId: ScenarioId;
  /** Configuration pack this journey is presented with. */
  industryId: IndustryId;
  status: OnboardingStatus;
  customerSafeStatus: string;
  currentAction?: OnboardingAction;
  progress: {
    currentStep: number;
    steps: Array<{
      id: string;
      label: string;
      state: ProgressState;
    }>;
  };
  applicant?: ApplicantView;
  documents?: DocumentView[];
  assistantMessages: AssistantMessage[];
  lastUpdatedAt: string;
  outcome?: {
    customerReference: string;
    accountReference: string;
    productName: string;
  };
  alert?: CustomerAlert;
  statusDetail?: string;
}

export interface CreateOnboardingCaseRequest {
  productCode: "EVERYDAY_PLUS";
  channel: "WEB";
  scenarioId: ScenarioId;
  /**
   * Which industry configuration drove this application.
   *
   * The orchestration layer runs one common onboarding flow for every
   * industry; this only tells the customer-facing experience which pack's
   * branding, vocabulary and evidence list to render.
   */
  industryId: IndustryId;
}

export interface CreateOnboardingCaseResponse {
  caseId: string;
  caseVersion: number;
  correlationId: string;
  status: OnboardingStatus;
  nextUrl: string;
}

export interface SubmitCaseActionRequest {
  actionId: string;
  expectedCaseVersion: number;
  data?: Record<string, unknown>;
}

export interface UploadedDocument {
  kind: DocumentKind;
  fileName: string;
  fileType: string;
  fileSize: number;
  source: "upload" | "demo";
  /** Handle returned by the document storage layer. */
  storageReference?: string;
}

export interface DocumentUploadResponse {
  documentId: string;
  fileName: string;
  status: "UPLOADED";
  evidenceReference: string;
}

export interface DemoExecutionEvent {
  id: string;
  caseId: string;
  correlationId: string;
  timestamp: string;
  category: "CASE" | "AGENT" | "TOOL" | "RULE" | "HUMAN" | "INTEGRATION";
  displayName: string;
  status: "STARTED" | "SUCCEEDED" | "FAILED" | "WAITING";
  summary: string;
  technicalDetails?: Record<string, unknown>;
}

export interface DemoSettings {
  orchestrationMode: OrchestrationMode;
  scenarioId: ScenarioId;
  demoControlEnabled: boolean;
  currentCaseId?: string;
}

export interface InternalOnboardingCase {
  caseId: string;
  caseVersion: number;
  correlationId: string;
  orchestrationMode: OrchestrationMode;
  scenarioId: ScenarioId;
  industryId: IndustryId;
  status: OnboardingStatus;
  customerSafeStatus: string;
  createdAt: string;
  lastUpdatedAt: string;
  applicant?: ApplicantView;
  consent?: ConsentView;
  documents: DocumentView[];
  assistantMessages: AssistantMessage[];
  events: DemoExecutionEvent[];
  alert?: CustomerAlert;
  outcome?: {
    customerReference: string;
    accountReference: string;
    productName: string;
  };
  verificationStartedAt?: string;
  screeningStartedAt?: string;
  customerCreationStartedAt?: string;
  reviewClearedAt?: string;
  lastBackendAction?: string;
  forcedTimeout?: boolean;
}

export interface DemoSnapshot {
  settings: DemoSettings;
  cases: InternalOnboardingCase[];
}

export interface OnboardingOrchestrationAdapter {
  createCase(
    request: CreateOnboardingCaseRequest,
  ): Promise<CreateOnboardingCaseResponse>;
  getCase(caseId: string): Promise<OnboardingCaseView>;
  submitAction(
    caseId: string,
    request: SubmitCaseActionRequest,
  ): Promise<OnboardingCaseView>;
  uploadDocument(
    caseId: string,
    document: UploadedDocument,
  ): Promise<DocumentUploadResponse>;
  getMessages(caseId: string): Promise<AssistantMessage[]>;
  getEvents(caseId: string): Promise<DemoExecutionEvent[]>;
}
