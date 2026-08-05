import type { IndustryPack } from "@/lib/industry/types";

/**
 * Telecom pack — adaptability demonstration.
 *
 * Same platform, same onboarding flow, same orchestration contract. Only the
 * branding, vocabulary, collected details and required evidence differ.
 */
export const telecomPack: IndustryPack = {
  id: "telecom",
  displayName: "Telecom",
  objective: "Onboard a business site and activate connectivity.",
  completeness: "adaptability-demonstration",

  brand: {
    organisationName: "Vantage Connect",
    productName: "Business Fibre 500",
    tagline: "Connectivity your business can rely on",
    accent: "#B4531F",
  },

  terminology: {
    customerNoun: "subscriber",
    productNoun: "service",
    activationVerb: "activated",
    intakeHeading: "Site and contact details",
    completionHeading: "Your service is active",
  },

  intakeFields: [
    { key: "firstName", label: "Contact first name" },
    { key: "lastName", label: "Contact last name" },
    { key: "dateOfBirth", label: "Date of birth", type: "date" },
    { key: "nationality", label: "Nationality" },
    { key: "mobile", label: "Contact number" },
    { key: "email", label: "Business email", type: "email" },
    { key: "addressLine1", label: "Installation address" },
    { key: "city", label: "City" },
    { key: "region", label: "State or region" },
    { key: "postalCode", label: "Postal code" },
    { key: "country", label: "Country" },
    {
      key: "employmentStatus",
      label: "Site type",
      options: ["Head office", "Branch office", "Warehouse", "Retail unit"],
    },
    {
      key: "incomeRange",
      label: "Service plan",
      options: [
        "Business Fibre 100",
        "Business Fibre 300",
        "Business Fibre 500",
        "Business Fibre 1000",
      ],
    },
    {
      key: "taxResidency",
      label: "Billing country",
      options: ["India", "United Kingdom", "United States", "Other"],
    },
  ],

  requiredDocuments: [
    {
      kind: "IDENTITY",
      label: "Authorised signatory identity",
      description: "Identity document for the person authorising the order.",
    },
    {
      kind: "ADDRESS",
      label: "Site and service order evidence",
      description:
        "Signed service order or a document confirming occupancy of the site.",
    },
  ],

  consentText:
    "I confirm I am authorised to order services for this site and permit Vantage Connect to verify the details and evidence I have supplied.",

  systems: [
    "Serviceability check",
    "Provisioning",
    "Billing",
    "Customer relationship management",
  ],

  sampleApplicant: {
    firstName: "Priya",
    lastName: "Nair",
    dateOfBirth: "1990-11-05",
    nationality: "Indian",
    mobile: "+91 90000 22222",
    email: "priya.nair@example.test",
    addressLine1: "7 Industrial Park Road",
    city: "Bengaluru",
    region: "Karnataka",
    postalCode: "560100",
    country: "India",
    employmentStatus: "Branch office",
    incomeRange: "Business Fibre 500",
    taxResidency: "India",
  },
};
