import { z } from "zod";

import {
  ALLOWED_UPLOAD_TYPES,
  CONSENT_VERSION,
  MAX_UPLOAD_BYTES,
} from "@/lib/onboarding/constants";

export const applicantSchema = z.object({
  fullName: z.string().min(3, "Enter the full legal name."),
  dateOfBirth: z.string().min(1, "Enter the date of birth."),
  nationality: z.string().min(2, "Enter the nationality."),
  mobile: z.string().min(8, "Enter the mobile number."),
  email: z.email("Enter a valid email address."),
  addressLine1: z.string().min(5, "Enter the residential address."),
  city: z.string().min(2, "Enter the city."),
  region: z.string().min(2, "Enter the state or region."),
  postalCode: z.string().min(4, "Enter the postal code."),
  country: z.string().min(2, "Enter the country."),
  employmentStatus: z.string().min(2, "Select the employment status."),
  incomeRange: z.string().min(2, "Select the income range."),
  taxResidency: z.string().min(2, "Enter the tax residency."),
});

export const consentSchema = z.object({
  accepted: z.literal(true),
  timestamp: z.string().min(1),
  textVersion: z.literal(CONSENT_VERSION),
  channel: z.literal("WEB"),
});

export const confirmAddressSchema = z.object({
  selectedAddress: z.string().min(5, "Select an address."),
  confirmed: z.literal(true),
});

export const createCaseSchema = z.object({
  productCode: z.literal("EVERYDAY_PLUS"),
  channel: z.literal("WEB"),
  scenarioId: z.enum(["ADDRESS_PEP_REVIEW", "HAPPY_PATH", "SERVICE_TIMEOUT"]),
});

export const submitActionSchema = z.object({
  actionId: z.string().min(1),
  expectedCaseVersion: z.number().int().positive(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const modeSchema = z.object({
  orchestrationMode: z.enum(["mock-pega", "pega", "non-pega"]),
});

export const scenarioSchema = z.object({
  scenarioId: z.enum(["ADDRESS_PEP_REVIEW", "HAPPY_PATH", "SERVICE_TIMEOUT"]),
});

export const passcodeSchema = z.object({
  passcode: z.string().min(1),
});

export const documentMetadataSchema = z.object({
  kind: z.enum(["IDENTITY", "ADDRESS"]),
  fileName: z.string().min(3),
  fileType: z.string().min(3),
  fileSize: z.number().int().nonnegative().max(MAX_UPLOAD_BYTES),
  source: z.enum(["upload", "demo"]),
});

export function validateDocumentFileType(fileType: string) {
  return ALLOWED_UPLOAD_TYPES.includes(fileType);
}
