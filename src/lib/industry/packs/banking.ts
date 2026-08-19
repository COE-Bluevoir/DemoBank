import type { IndustryPack } from "@/lib/industry/types";

/**
 * Banking pack — the reference implementation.
 *
 * This is the fully built journey; the other packs demonstrate that the same
 * platform adapts through configuration alone.
 */
export const bankingPack: IndustryPack = {
  id: "banking",
  industryCode: "BANKING",
  journeyCode: "BUSINESS_CURRENT_ACCOUNT",
  productOrServiceCode: "BUSINESS_CURRENT_ACCOUNT_ONLINE_BANKING",
  consentTextVersion: "northstar-consent-v1",

  // The order the customer is asked for evidence. The telephone bill is last
  // because it is the one the journey expects to disagree with the
  // application, and the discrepancy only means something once the registered
  // address has been established by the incorporation certificate.
  documentProfile: [
    {
      code: "INCORPORATION_CERTIFICATE",
      kind: "IDENTITY",
      label: "Certificate of incorporation",
      description:
        "Confirms the company exists and states its registered office.",
      mandatory: true,
      sampleFile: "D01_company_incorporation_certificate.png",
    },
    {
      code: "REPRESENTATIVE_ID",
      kind: "IDENTITY",
      label: "Authorised signatory identity",
      description:
        "Identity evidence for the person authorised to open the account.",
      mandatory: true,
      sampleFile: "D02_authorized_signatory_sample_id.png",
    },
    {
      code: "AUTHORIZATION_LETTER",
      kind: "IDENTITY",
      label: "Board resolution",
      description:
        "Confirms the signatory is authorised to open the account on the company's behalf.",
      mandatory: true,
      sampleFile: "D04_board_resolution_authorized_signatory.png",
    },
    {
      code: "TAX_REGISTRATION",
      kind: "IDENTITY",
      label: "Tax registration certificate",
      description: "GST registration for the business.",
      mandatory: true,
      sampleFile: "D03_tax_registration_certificate.png",
    },
    {
      code: "ADDRESS_PROOF",
      kind: "ADDRESS",
      label: "Business address proof",
      description:
        "A recent utility or telephone bill showing the business address.",
      mandatory: true,
      sampleFile: "B04_telephone_bill_address_mismatch.png",
    },
  ],

  checkProfile: {
    verifyEntity: true,
    screenParty: true,
    checkDuplicate: true,
    validateAddress: true,
    evaluateExternalRisk: true,
    checkServiceability: false,
  },
  displayName: "Banking",
  objective: "Open an everyday account and activate online banking.",
  completeness: "reference-implementation",

  brand: {
    organisationName: "NorthStar Bank",
    productName: "Everyday Plus Account",
    tagline: "Banking that moves with you",
    accent: "#1F4FD8",
  },

  // Three business banking products, all opening through the identical
  // document/screening journey below — only the name, positioning and
  // `ProductIntent` sent to Pega change with which one a customer picks.
  products: [
    {
      code: "EVERYDAY_PLUS",
      name: "Everyday Plus Account",
      tagline: "Recommended for salary and everyday banking",
      description:
        "A premium everyday account experience built for salary credits, secure digital payments and regulated onboarding clarity.",
    },
    {
      code: "BUSINESS_GROWTH",
      name: "Business Growth Account",
      tagline: "Built for scaling operations",
      description:
        "Higher transaction limits and dedicated relationship support for a business that has outgrown its first account.",
    },
    {
      code: "MERCHANT_COLLECTIONS",
      name: "Merchant Collections Account",
      tagline: "For businesses collecting customer payments",
      description:
        "Same-day settlement and built-in reconciliation for a business taking payments from customers at scale.",
    },
  ],

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
    firstName: "Arjun",
    lastName: "Mehta",
    dateOfBirth: "1991-08-14",
    nationality: "Indian",
    mobile: "+91 89688 98973",
    email: "arjun.mehta@gmail.com",
    addressLine1: "Flat 4B, Lake View Residency",
    city: "Bengaluru",
    region: "Karnataka",
    postalCode: "560038",
    country: "India",
    employmentStatus: "Self-employed",
    incomeRange: "INR 15 lakh+ per annum",
    taxResidency: "India",
  },
};
