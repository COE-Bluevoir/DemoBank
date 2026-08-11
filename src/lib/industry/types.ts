import type { ApplicantView, DocumentKind } from "@/lib/onboarding/types";

/**
 * Industry configuration pack.
 *
 * The accelerator is one platform with one onboarding flow. Everything that
 * differs between industries is data, declared here — branding, the words the
 * customer reads, which details are collected, and which evidence is required.
 *
 * Deliberately excluded: case lifecycle, stages, policy, routing and approval.
 * Those are owned by the orchestration layer and are identical for every
 * industry, which is what makes the platform reusable rather than three
 * applications wearing different logos.
 */

export type IndustryId = "banking" | "insurance" | "telecom";

/** Codes the orchestration layer is keyed on, per the accelerator contract. */
export type IndustryCode = "BANKING" | "INSURANCE" | "TELECOM";

export type JourneyCode =
  | "BUSINESS_CURRENT_ACCOUNT"
  | "COMMERCIAL_PROPERTY_POLICY"
  | "BUSINESS_CONNECTIVITY";

/**
 * A document the journey asks for.
 *
 * `code` is the category the extraction tool is told to expect, and is what
 * ties an uploaded file to its ground-truth extraction.
 */
export interface DocumentRequirement {
  code: string;
  label: string;
  description: string;
  /**
   * Which class of evidence this counts as.
   *
   * Several documents can share a class — an incorporation certificate and a
   * GST certificate both evidence the organisation — so the code identifies
   * the document while the kind drives verification and policy.
   */
  kind: DocumentKind;
  /** False for evidence that is useful but not required to proceed. */
  mandatory: boolean;
}

/**
 * Which external checks this journey runs.
 *
 * Declared rather than inferred: a telecom journey checks serviceability and
 * has no use for sanctions screening of a warehouse, and an insurer needs an
 * underwriting score rather than a credit bureau file.
 */
export interface CheckProfile {
  verifyEntity: boolean;
  screenParty: boolean;
  checkDuplicate: boolean;
  validateAddress: boolean;
  evaluateExternalRisk: boolean;
  checkServiceability: boolean;
}

/** A field the customer is asked for during intake. */
export interface IntakeField {
  /** Key on `ApplicantView`. Constrained so packs cannot invent storage. */
  key: keyof ApplicantView;
  label: string;
  type?: "text" | "date" | "email";
  /** Present for dropdowns; absent for free text. */
  options?: readonly string[];
}

/** Evidence the customer must provide. */
export interface RequiredDocument {
  kind: DocumentKind;
  label: string;
  description: string;
}

/**
 * The words the customer sees.
 *
 * A bank has customers opening accounts; an insurer has policyholders taking
 * out policies; a telecom has subscribers activating services. The journey is
 * the same, the vocabulary is not.
 */
export interface IndustryTerminology {
  /** What the organisation calls the person applying. */
  customerNoun: string;
  /** What is being opened, issued or activated. */
  productNoun: string;
  /** Verb for the final step, e.g. "opened", "issued", "activated". */
  activationVerb: string;
  /** Heading for the intake step. */
  intakeHeading: string;
  /** Heading for the completed journey. */
  completionHeading: string;
}

export interface IndustryBrand {
  organisationName: string;
  productName: string;
  tagline: string;
  /** Accent colour for the industry surface, as a CSS colour value. */
  accent: string;
}

export interface IndustryPack {
  id: IndustryId;
  /** Sent to the orchestration layer; selects behaviour, not presentation. */
  industryCode: IndustryCode;
  journeyCode: JourneyCode;
  /** What is being opened, issued or provisioned. */
  productOrServiceCode: string;
  /** Version of the consent wording the customer accepted. */
  consentTextVersion: string;
  /** Evidence this journey collects, in the order it is asked for. */
  documentProfile: readonly DocumentRequirement[];
  /** External checks this journey runs. */
  checkProfile: CheckProfile;
  /** Shown in the accelerator launcher. */
  displayName: string;
  /** One line describing the onboarding objective for this industry. */
  objective: string;
  brand: IndustryBrand;
  terminology: IndustryTerminology;
  intakeFields: readonly IntakeField[];
  requiredDocuments: readonly RequiredDocument[];
  /** Consent wording shown before evidence is collected. */
  consentText: string;
  /**
   * Downstream systems this industry would integrate with. Presented as
   * context in the accelerator; the demo does not call them.
   */
  systems: readonly string[];
  /** Sample applicant used by the presenter shortcut. */
  sampleApplicant: ApplicantView;
  /**
   * Whether this pack drives a complete journey.
   *
   * Banking is the reference implementation. The others demonstrate that the
   * same platform adapts through configuration, and say so plainly rather
   * than implying depth they do not have.
   */
  completeness: "reference-implementation" | "adaptability-demonstration";
}
