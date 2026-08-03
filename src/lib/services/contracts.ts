import { z } from "zod";

/**
 * Tool service contracts.
 *
 * These are the approved capabilities the orchestration layer may invoke.
 * Every tool returns structured output — never free text — so Pega rules can
 * evaluate results deterministically instead of parsing prose.
 *
 * Provider and evidence references appear in these payloads because they are
 * internal-only; none of it is safe to surface in the customer journey.
 */

export const TOOL_NAMES = [
  "extract-identity",
  "extract-address",
  "verify-identity",
  "validate-address",
  "screen-sanctions",
  "screen-pep",
  "check-duplicate",
  "create-customer",
  "generate-communication",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/** Envelope shared by every tool response. */
export const toolMetaSchema = z.object({
  tool: z.enum(TOOL_NAMES),
  providerReference: z.string(),
  toolVersion: z.string(),
  correlationId: z.string(),
  executionId: z.string(),
  completedAt: z.string(),
  /** True when this response was replayed from an idempotency key. */
  replayed: z.boolean(),
});

export type ToolMeta = z.infer<typeof toolMetaSchema>;

const addressSchema = z.object({
  addressLine1: z.string(),
  city: z.string(),
  region: z.string(),
  postalCode: z.string(),
  country: z.string(),
});

// --- Extraction -----------------------------------------------------------

export const extractIdentityRequestSchema = z.object({
  caseId: z.string().min(1),
  documentId: z.string().min(1),
  storageReference: z.string().min(1),
});

export const extractIdentityResultSchema = z.object({
  fullName: z.string(),
  dateOfBirth: z.string(),
  documentNumber: z.string(),
  documentType: z.string(),
  issuingCountry: z.string(),
  expiresOn: z.string(),
  extractionConfidence: z.number().min(0).max(1),
});

export const extractAddressRequestSchema = extractIdentityRequestSchema;

export const extractAddressResultSchema = z.object({
  address: addressSchema,
  issuedOn: z.string(),
  issuerName: z.string(),
  extractionConfidence: z.number().min(0).max(1),
});

// --- Verification ---------------------------------------------------------

export const verifyIdentityRequestSchema = z.object({
  caseId: z.string().min(1),
  fullName: z.string().min(1),
  dateOfBirth: z.string().min(1),
  documentNumber: z.string().min(1),
});

export const checkOutcomeSchema = z.enum([
  "PASSED",
  "CLEAR",
  "POTENTIAL_MATCH",
  "FAILED",
]);

export type CheckOutcome = z.infer<typeof checkOutcomeSchema>;

export const verifyIdentityResultSchema = z.object({
  outcome: checkOutcomeSchema,
  matchScore: z.number().min(0).max(1),
  reasonCodes: z.array(z.string()),
});

export const validateAddressRequestSchema = z.object({
  caseId: z.string().min(1),
  applicationAddress: addressSchema,
  documentAddress: addressSchema.optional(),
});

export const validateAddressResultSchema = z.object({
  outcome: checkOutcomeSchema,
  normalizedAddress: addressSchema,
  mismatch: z
    .object({
      field: z.string(),
      applicationValue: z.string(),
      documentValue: z.string(),
      /**
       * Advisory only. Pega rules decide how a mismatch is handled; this
       * service never routes a case.
       */
      suggestedClassification: z.enum(["CORRECTABLE", "MATERIAL", "HARD_STOP"]),
    })
    .optional(),
  reasonCodes: z.array(z.string()),
});

// --- Screening ------------------------------------------------------------

export const screeningRequestSchema = z.object({
  caseId: z.string().min(1),
  fullName: z.string().min(1),
  dateOfBirth: z.string().min(1),
  nationality: z.string().min(1),
});

export const screeningResultSchema = z.object({
  outcome: checkOutcomeSchema,
  matchConfidence: z.number().min(0).max(1),
  listsSearched: z.array(z.string()),
  candidates: z.array(
    z.object({
      candidateId: z.string(),
      name: z.string(),
      matchConfidence: z.number().min(0).max(1),
      listName: z.string(),
    }),
  ),
  reasonCodes: z.array(z.string()),
});

export const duplicateCheckRequestSchema = z.object({
  caseId: z.string().min(1),
  fullName: z.string().min(1),
  dateOfBirth: z.string().min(1),
  email: z.string().min(1),
  mobile: z.string().min(1),
});

export const duplicateCheckResultSchema = z.object({
  outcome: checkOutcomeSchema,
  existingCustomerId: z.string().optional(),
  matchConfidence: z.number().min(0).max(1),
  reasonCodes: z.array(z.string()),
});

// --- Fulfilment -----------------------------------------------------------

export const createCustomerRequestSchema = z.object({
  caseId: z.string().min(1),
  productCode: z.string().min(1),
  applicant: z.object({
    fullName: z.string().min(1),
    dateOfBirth: z.string().min(1),
    email: z.string().min(1),
    mobile: z.string().min(1),
    address: addressSchema,
  }),
});

export const createCustomerResultSchema = z.object({
  customerId: z.string(),
  accountId: z.string(),
  productCode: z.string(),
  openedAt: z.string(),
  completionMethod: z.literal("AUTOMATED"),
});

export const generateCommunicationRequestSchema = z.object({
  caseId: z.string().min(1),
  templateId: z.enum(["WELCOME_ACCOUNT_OPENED", "APPLICATION_SAVED"]),
  customerFirstName: z.string().min(1),
  productName: z.string().min(1),
  customerId: z.string().optional(),
  accountId: z.string().optional(),
});

export const generateCommunicationResultSchema = z.object({
  templateId: z.string(),
  subject: z.string(),
  /** Plain text only. Rendered without HTML interpretation. */
  body: z.string(),
  channel: z.literal("EMAIL"),
});
