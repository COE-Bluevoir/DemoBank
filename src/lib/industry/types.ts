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
