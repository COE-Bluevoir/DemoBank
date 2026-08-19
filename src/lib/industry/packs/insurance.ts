import type { IndustryPack } from "@/lib/industry/types";

/**
 * Insurance pack — adaptability demonstration.
 *
 * Same platform, same onboarding flow, same orchestration contract. Only the
 * branding, vocabulary, collected details and required evidence differ.
 */
export const insurancePack: IndustryPack = {
  id: "insurance",
  industryCode: "INSURANCE",
  journeyCode: "COMMERCIAL_PROPERTY_POLICY",
  productOrServiceCode: "COMMERCIAL_PROPERTY_FIRE_POLICY",
  consentTextVersion: "meridian-consent-v1",

  documentProfile: [
    {
      code: "INCORPORATION_CERTIFICATE",
      kind: "IDENTITY",
      label: "Certificate of incorporation",
      description: "Confirms the company exists and states its registered office.",
      mandatory: true,
      sampleFile: "D01_company_incorporation_certificate.png",
    },
    {
      code: "REPRESENTATIVE_ID",
      kind: "IDENTITY",
      label: "Authorised signatory identity",
      description: "Identity evidence for the person authorising the proposal.",
      mandatory: true,
      sampleFile: "D02_authorized_signatory_sample_id.png",
    },
    {
      code: "AUTHORIZATION_LETTER",
      kind: "IDENTITY",
      label: "Board resolution",
      description:
        "Confirms the signatory is authorised to procure this policy on the company's behalf.",
      mandatory: true,
      sampleFile: "D04_board_resolution_authorized_signatory.png",
    },
    {
      code: "PROPOSAL_FORM",
      kind: "IDENTITY",
      label: "Commercial insurance proposal",
      description: "States the risk location and the protections in place.",
      mandatory: true,
      sampleFile: "I03_commercial_insurance_proposal_form.png",
    },
    {
      code: "RISK_QUESTIONNAIRE",
      kind: "ADDRESS",
      label: "Fire risk questionnaire",
      description:
        "The surveyor's record of the same premises, used to corroborate the proposal.",
      mandatory: true,
      sampleFile: "I04_fire_risk_questionnaire_conflict.png",
    },
    {
      code: "PROPERTY_SCHEDULE",
      kind: "ADDRESS",
      label: "Property schedule",
      description: "Contents and values for the premises being insured.",
      mandatory: false,
      sampleFile: "I05_property_schedule.png",
    },
  ],

  checkProfile: {
    verifyEntity: true,
    screenParty: true,
    checkDuplicate: false,
    validateAddress: false,
    evaluateExternalRisk: true,
    checkServiceability: false,
  },
  displayName: "Insurance",
  objective: "Complete a policy application and issue cover.",
  completeness: "adaptability-demonstration",

  brand: {
    organisationName: "Meridian Insurance",
    productName: "Household Protect Policy",
    tagline: "Cover that keeps its promises",
    accent: "#0F7B6C",
  },

  // Three commercial property products, all opening through the identical
  // document/screening journey below — only the name, positioning and
  // `ProductIntent` sent to Pega change with which one a customer picks.
  products: [
    {
      code: "HOUSEHOLD_PROTECT",
      name: "Household Protect Policy",
      tagline: "Recommended for premises and property cover",
      description:
        "Fire, weather and theft cover for a single commercial premises, with a straightforward claims process.",
    },
    {
      code: "COMMERCIAL_PROPERTY_SHIELD",
      name: "Commercial Property Shield",
      tagline: "Built for higher-value business premises",
      description:
        "Broader cover for buildings, fixtures and stock, with loss-of-rent protection while a claim is settled.",
    },
    {
      code: "BUSINESS_LIABILITY_COVER",
      name: "Business Liability Cover",
      tagline: "For businesses managing third-party risk",
      description:
        "Public and product liability cover for a business whose operations bring it into contact with customers or the public.",
    },
  ],

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
