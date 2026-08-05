import { z } from "zod";

import { formatFullName } from "@/lib/onboarding/applicant-name";
import {
  DEMO_CUSTOMER,
  DOCUMENT_MISMATCH_ADDRESS,
} from "@/lib/onboarding/constants";
import type {
  extractAddressRequestSchema,
  extractAddressResultSchema,
  extractIdentityRequestSchema,
  extractIdentityResultSchema,
  validateAddressRequestSchema,
  validateAddressResultSchema,
  verifyIdentityRequestSchema,
  verifyIdentityResultSchema,
} from "@/lib/services/contracts";
import {
  deterministicReference,
  deterministicScore,
  normalizeForComparison,
} from "@/lib/services/deterministic";

/**
 * Document extraction and verification tools.
 *
 * These stand in for a document-AI provider and an identity bureau. Outputs
 * are structured and deterministic; classification is advisory only, because
 * routing decisions belong to the orchestration rules.
 */

type ExtractIdentityRequest = z.infer<typeof extractIdentityRequestSchema>;
type ExtractIdentityResult = z.infer<typeof extractIdentityResultSchema>;
type ExtractAddressRequest = z.infer<typeof extractAddressRequestSchema>;
type ExtractAddressResult = z.infer<typeof extractAddressResultSchema>;
type VerifyIdentityRequest = z.infer<typeof verifyIdentityRequestSchema>;
type VerifyIdentityResult = z.infer<typeof verifyIdentityResultSchema>;
type ValidateAddressRequest = z.infer<typeof validateAddressRequestSchema>;
type ValidateAddressResult = z.infer<typeof validateAddressResultSchema>;

export function extractIdentity(
  request: ExtractIdentityRequest,
): ExtractIdentityResult {
  const seed = `${request.caseId}:${request.storageReference}`;

  return {
    fullName: formatFullName(DEMO_CUSTOMER),
    dateOfBirth: DEMO_CUSTOMER.dateOfBirth,
    documentNumber: deterministicReference("IDN", seed),
    documentType: "NATIONAL_ID",
    issuingCountry: DEMO_CUSTOMER.country,
    expiresOn: "2032-08-14",
    extractionConfidence: deterministicScore(seed, 0.93, 0.99),
  };
}

/**
 * Proof-of-address extraction.
 *
 * Returns the document address from the scripted scenario, which differs from
 * the application address by house number. That difference is what drives the
 * customer-confirmation step.
 */
export function extractAddress(
  request: ExtractAddressRequest,
): ExtractAddressResult {
  const seed = `${request.caseId}:${request.storageReference}`;

  return {
    address: {
      addressLine1: DOCUMENT_MISMATCH_ADDRESS,
      city: DEMO_CUSTOMER.city,
      region: DEMO_CUSTOMER.region,
      postalCode: DEMO_CUSTOMER.postalCode,
      country: DEMO_CUSTOMER.country,
    },
    issuedOn: "2026-05-02",
    issuerName: "City Power and Water",
    extractionConfidence: deterministicScore(seed, 0.9, 0.98),
  };
}

export function verifyIdentity(
  request: VerifyIdentityRequest,
): VerifyIdentityResult {
  const seed = `${request.caseId}:${request.fullName}:${request.documentNumber}`;
  const matchScore = deterministicScore(seed, 0.9, 0.99);

  return {
    outcome: "PASSED",
    matchScore,
    reasonCodes: ["NAME_MATCH", "DOB_MATCH", "DOCUMENT_VALID"],
  };
}

/**
 * Compare the application address against the extracted document address.
 *
 * Only the address line is expected to differ in the scripted scenario. A
 * difference in city, region, postal code or country is reported as material
 * so the rules layer can treat it more strictly.
 */
export function validateAddress(
  request: ValidateAddressRequest,
): ValidateAddressResult {
  const application = request.applicationAddress;
  const document = request.documentAddress;

  if (!document) {
    return {
      outcome: "PASSED",
      normalizedAddress: application,
      reasonCodes: ["NO_DOCUMENT_ADDRESS_SUPPLIED"],
    };
  }

  const structuralFields = ["city", "region", "postalCode", "country"] as const;
  const structuralMismatch = structuralFields.find(
    (field) =>
      normalizeForComparison(application[field]) !==
      normalizeForComparison(document[field]),
  );

  if (structuralMismatch) {
    return {
      outcome: "POTENTIAL_MATCH",
      normalizedAddress: application,
      mismatch: {
        field: structuralMismatch,
        applicationValue: application[structuralMismatch],
        documentValue: document[structuralMismatch],
        suggestedClassification: "MATERIAL",
      },
      reasonCodes: ["ADDRESS_REGION_MISMATCH"],
    };
  }

  const lineMatches =
    normalizeForComparison(application.addressLine1) ===
    normalizeForComparison(document.addressLine1);

  if (lineMatches) {
    return {
      outcome: "PASSED",
      normalizedAddress: application,
      reasonCodes: ["ADDRESS_MATCH"],
    };
  }

  return {
    outcome: "POTENTIAL_MATCH",
    normalizedAddress: application,
    mismatch: {
      field: "addressLine1",
      applicationValue: application.addressLine1,
      documentValue: document.addressLine1,
      suggestedClassification: "CORRECTABLE",
    },
    reasonCodes: ["ADDRESS_LINE_MISMATCH", "CUSTOMER_CONFIRMATION_AVAILABLE"],
  };
}
