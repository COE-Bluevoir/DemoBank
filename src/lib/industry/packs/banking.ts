import type { IndustryPack } from "@/lib/industry/types";

/**
 * Banking pack — the reference implementation.
 *
 * This is the fully built journey; the other packs demonstrate that the same
 * platform adapts through configuration alone.
 */
export const bankingPack: IndustryPack = {
  id: "banking",
  displayName: "Banking",
  objective: "Open an everyday account and activate online banking.",
  completeness: "reference-implementation",

  brand: {
    organisationName: "NorthStar Bank",
    productName: "Everyday Plus Account",
    tagline: "Banking that moves with you",
    accent: "#1F4FD8",
  },

  terminology: {
    customerNoun: "customer",
    productNoun: "account",
    activationVerb: "opened",
    intakeHeading: "Your details",
    completionHeading: "Your account is open",
  },

  intakeFields: [
    { key: "firstName", label: "First name" },
    { key: "lastName", label: "Last name" },
    { key: "dateOfBirth", label: "Date of birth", type: "date" },
    { key: "nationality", label: "Nationality" },
    { key: "mobile", label: "Mobile number" },
    { key: "email", label: "Email address", type: "email" },
    { key: "addressLine1", label: "Residential address" },
    { key: "city", label: "City" },
    { key: "region", label: "State or region" },
    { key: "postalCode", label: "Postal code" },
    { key: "country", label: "Country" },
    {
      key: "employmentStatus",
      label: "Employment status",
      options: ["Salaried", "Self-employed", "Student", "Other"],
    },
    {
      key: "incomeRange",
      label: "Income range",
      options: [
        "INR 0-5 lakh per annum",
        "INR 5-10 lakh per annum",
        "INR 10-15 lakh per annum",
        "INR 15 lakh+ per annum",
      ],
    },
    {
      key: "taxResidency",
      label: "Tax residency",
      options: ["India", "United Kingdom", "United States", "Other"],
    },
  ],

  requiredDocuments: [
    {
      kind: "IDENTITY",
      label: "Government-issued identity",
      description: "Passport, national identity card or driver licence.",
    },
    {
      kind: "ADDRESS",
      label: "Proof of address",
      description: "A recent utility bill or bank statement.",
    },
  ],

  consentText:
    "I confirm the information provided is accurate and authorise NorthStar Bank to verify my identity and address using the documents I supply.",

  systems: [
    "KYC and AML screening",
    "Sanctions screening",
    "Customer relationship management",
    "Core banking",
    "Document repository",
  ],

  sampleApplicant: {
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
  },
};
