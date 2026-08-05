import type {
  ApplicantView,
  CustomerAlert,
  OnboardingAction,
  OnboardingStatus,
  OrchestrationMode,
  ScenarioId,
} from "@/lib/onboarding/types";

export const BRAND = {
  bankName: "NorthStar Bank",
  productName: "Everyday Plus Account",
  tagline: "Banking that moves with you",
};

export const DEMO_CUSTOMER: ApplicantView = {
  firstName: "Ananya",
  lastName: "Rao",
  dateOfBirth: "1992-08-14",
  nationality: "Indian",
  mobile: "+91 90000 00000",
  email: "ananya.rao@example.test",
  addressLine1: "18 Lake View Road",
  city: "Hyderabad",
  region: "Telangana",
  postalCode: "500081",
  country: "India",
  employmentStatus: "Salaried",
  incomeRange: "INR 10-15 lakh per annum",
  taxResidency: "India",
};

export const DOCUMENT_MISMATCH_ADDRESS = "81 Lake View Road";

export const SCENARIO_OPTIONS: Array<{
  id: ScenarioId;
  label: string;
  description: string;
}> = [
  {
    id: "ADDRESS_PEP_REVIEW",
    label: "Address mismatch + routine review",
    description:
      "The leadership demo path with an address mismatch followed by a customer-safe routine review.",
  },
  {
    id: "HAPPY_PATH",
    label: "Happy path",
    description:
      "A clean deterministic journey that progresses directly to customer creation.",
  },
  {
    id: "SERVICE_TIMEOUT",
    label: "Service timeout",
    description:
      "Simulates a verification timeout and preserves a saved application with a safe message.",
  },
];

export const MODE_OPTIONS: Array<{
  id: OrchestrationMode;
  label: string;
  description: string;
}> = [
  {
    id: "mock-pega",
    label: "Mock Pega",
    description: "Deterministic mock orchestration aligned to the Pega path.",
  },
  {
    id: "pega",
    label: "Pega placeholder",
    description: "Future real adapter surface; currently delegates to the mock engine.",
  },
  {
    id: "non-pega",
    label: "Non-Pega placeholder",
    description:
      "Future comparison adapter surface; currently delegates to the mock engine.",
  },
];

export const CUSTOMER_SAFE_STATUS: Record<OnboardingStatus, string> = {
  STARTED: "Application started",
  INFORMATION_REQUIRED: "Information required",
  DOCUMENTS_REQUIRED: "Information required",
  VERIFYING_DOCUMENTS: "Documents being verified",
  ADDRESS_CONFIRMATION_REQUIRED: "Information required",
  SCREENING_IN_PROGRESS: "Checks in progress",
  ROUTINE_REVIEW: "Routine review",
  CREATING_CUSTOMER: "Account being created",
  COMPLETED: "Onboarding complete",
  UNABLE_TO_CONTINUE: "Unable to continue",
};

export const CONSENT_TEXT =
  "I authorise NorthStar Bank to collect, validate and review the information and documents I provide in connection with my application for an Everyday Plus Account.";

export const CONSENT_VERSION = "northstar-consent-v1";

export const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const PRODUCT_RECOMMENDATION_MESSAGE =
  "The Everyday Plus Account may suit that requirement. It supports salary credits, digital payments and everyday banking. Would you like to review the account details or begin your application?";

export const START_ASSISTANT_ACTION: OnboardingAction = {
  id: "BEGIN_APPLICATION",
  label: "Begin application",
  description: "Start the formal onboarding flow for the Everyday Plus Account.",
};

export const TIMEOUT_ALERT: CustomerAlert = {
  title: "Verification saved for later",
  tone: "warning",
  message:
    "We could not complete one of the verification steps at this time. Your application has been saved, and no action is required from you yet.",
};

export const CASE_PROGRESS_STEPS = [
  { id: "details", label: "Your details" },
  { id: "documents", label: "Documents" },
  { id: "verification", label: "Verification" },
  { id: "review", label: "Review" },
  { id: "complete", label: "Complete" },
] as const;
