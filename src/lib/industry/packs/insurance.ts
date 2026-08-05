import type { IndustryPack } from "@/lib/industry/types";

/**
 * Insurance pack — adaptability demonstration.
 *
 * Same platform, same onboarding flow, same orchestration contract. Only the
 * branding, vocabulary, collected details and required evidence differ.
 */
export const insurancePack: IndustryPack = {
  id: "insurance",
  displayName: "Insurance",
  objective: "Complete a policy application and issue cover.",
  completeness: "adaptability-demonstration",

  brand: {
    organisationName: "Meridian Insurance",
    productName: "Household Protect Policy",
    tagline: "Cover that keeps its promises",
    accent: "#0F7B6C",
  },

  terminology: {
    customerNoun: "policyholder",
    productNoun: "policy",
    activationVerb: "issued",
    intakeHeading: "Proposer details",
    completionHeading: "Your policy is issued",
  },

  intakeFields: [
    { key: "firstName", label: "First name" },
    { key: "lastName", label: "Last name" },
    { key: "dateOfBirth", label: "Date of birth", type: "date" },
    { key: "nationality", label: "Nationality" },
    { key: "mobile", label: "Contact number" },
    { key: "email", label: "Email address", type: "email" },
    { key: "addressLine1", label: "Address of the insured property" },
    { key: "city", label: "City" },
    { key: "region", label: "State or region" },
    { key: "postalCode", label: "Postal code" },
    { key: "country", label: "Country" },
    {
      key: "employmentStatus",
      label: "Occupation category",
      options: ["Salaried", "Self-employed", "Retired", "Other"],
    },
    {
      key: "incomeRange",
      label: "Sum insured",
      options: [
        "Up to INR 10 lakh",
        "INR 10-25 lakh",
        "INR 25-50 lakh",
        "INR 50 lakh+",
      ],
    },
    {
      key: "taxResidency",
      label: "Country of residence",
      options: ["India", "United Kingdom", "United States", "Other"],
    },
  ],

  requiredDocuments: [
    {
      kind: "IDENTITY",
      label: "Proposer identity",
      description: "Passport, national identity card or driver licence.",
    },
    {
      kind: "ADDRESS",
      label: "Property and risk evidence",
      description:
        "Property ownership document, valuation or a recent survey report.",
    },
  ],

  consentText:
    "I confirm the information in this proposal is true and complete, and authorise Meridian Insurance to verify it and assess the risk using the evidence I supply.",

  systems: [
    "Underwriting",
    "Policy administration",
    "Customer relationship management",
    "Document repository",
  ],

  sampleApplicant: {
    firstName: "Rohan",
    lastName: "Mehta",
    dateOfBirth: "1985-03-22",
    nationality: "Indian",
    mobile: "+91 90000 11111",
    email: "rohan.mehta@example.test",
    addressLine1: "42 Hillcrest Avenue",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411001",
    country: "India",
    employmentStatus: "Self-employed",
    incomeRange: "INR 25-50 lakh",
    taxResidency: "India",
  },
};
