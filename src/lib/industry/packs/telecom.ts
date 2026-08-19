import type { IndustryPack } from "@/lib/industry/types";

/**
 * Telecom pack — adaptability demonstration.
 *
 * Same platform, same onboarding flow, same orchestration contract. Only the
 * branding, vocabulary, collected details and required evidence differ.
 */
export const telecomPack: IndustryPack = {
  id: "telecom",
  industryCode: "TELECOM",
  journeyCode: "BUSINESS_CONNECTIVITY",
  productOrServiceCode: "DEDICATED_INTERNET_LEASED_LINE",
  consentTextVersion: "vantage-consent-v1",

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
      description: "Identity evidence for the person authorising the order.",
      mandatory: true,
      sampleFile: "D02_authorized_signatory_sample_id.png",
    },
    {
      code: "AUTHORIZATION_LETTER",
      kind: "IDENTITY",
      label: "Board resolution",
      description:
        "Confirms the signatory is authorised to order services on the company's behalf.",
      mandatory: true,
      sampleFile: "D04_board_resolution_authorized_signatory.png",
    },
    {
      code: "SERVICE_ORDER",
      kind: "IDENTITY",
      label: "Service order",
      description: "The connectivity ordered, and the site it is ordered for.",
      mandatory: true,
      sampleFile: "T03_business_connectivity_service_order.png",
    },
    {
      code: "SITE_ADDRESS_PROOF",
      kind: "ADDRESS",
      label: "Site address proof",
      description: "A utility bill confirming occupancy of the installation site.",
      mandatory: true,
      sampleFile: "T04_site_address_electricity_bill.png",
    },
    {
      code: "SITE_AUTHORISATION",
      kind: "ADDRESS",
      label: "Site authorisation letter",
      description: "Permission to install equipment at the site.",
      mandatory: false,
      sampleFile: "T05_site_authorization_letter.png",
    },
  ],

  checkProfile: {
    verifyEntity: true,
    screenParty: false,
    checkDuplicate: true,
    validateAddress: true,
    evaluateExternalRisk: true,
    checkServiceability: true,
  },
  displayName: "Telecom",
  objective: "Onboard a business site and activate connectivity.",
  completeness: "adaptability-demonstration",

  brand: {
    organisationName: "Vantage Connect",
    productName: "Business Fibre 500",
    tagline: "Connectivity your business can rely on",
    accent: "#B4531F",
  },

  // Three connectivity tiers, all opening through the identical
  // document/screening journey below — only the name, positioning and
  // `ProductIntent` sent to Pega change with which one a customer picks.
  products: [
    {
      code: "BUSINESS_FIBRE_500",
      name: "Business Fibre 500",
      tagline: "Recommended for growing business sites",
      description:
        "500 Mbps dedicated connectivity with a guaranteed uptime SLA, sized for a single active business site.",
    },
    {
      code: "BUSINESS_FIBRE_1000",
      name: "Business Fibre 1000",
      tagline: "Built for high-bandwidth, multi-site operations",
      description:
        "1 Gbps dedicated connectivity with priority provisioning, for operations running multiple connected sites.",
    },
    {
      code: "BUSINESS_FIBRE_100",
      name: "Business Fibre 100",
      tagline: "For a single site getting started",
      description:
        "100 Mbps dedicated connectivity at the lowest cost of entry, with the same reliability as the higher tiers.",
    },
  ],

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
