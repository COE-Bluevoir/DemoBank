/**
 * Ground truth for the supplied sample documents.
 *
 * Transcribed by reading each file in `sample_docs/`. This is the reference
 * an extraction is judged against: the agent test matrix requires that
 * mandatory fields come out correctly and that cross-document comparisons
 * find the two planted contradictions.
 *
 * Every document is visibly marked SAMPLE — NOT VALID — OCR TEST. The
 * identifiers below are synthetic and belong to no real company or person.
 *
 * Where the storyline packs and the documents disagree on names, the
 * documents win: they are what gets uploaded and read, so an extraction
 * asserted against the storyline's "Nila Test Foods" would fail against every
 * supplied file.
 */

export interface ExpectedExtraction {
  /** Category the journey asked for, matching `DocumentRequirement.code`. */
  documentCode: string;
  /** Human label, used in the demo narration. */
  label: string;
  /** Fields an extraction must return, and the value it must return. */
  fields: Record<string, string>;
  /** Per-field confidence the mock extractor reports. */
  fieldConfidence: Record<string, number>;
  overallConfidence: number;
}

const SUNSPIRE_REGISTERED_ADDRESS =
  "2nd Floor, 14 MG Road, Bengaluru, Karnataka 560001";

export const EXPECTED_EXTRACTIONS: Record<string, ExpectedExtraction> = {
  /** Shared by all three journeys — establishes the organisation. */
  INCORPORATION_CERTIFICATE: {
    documentCode: "INCORPORATION_CERTIFICATE",
    label: "Certificate of Incorporation",
    fields: {
      "Company Name": "Sunspire Retail Private Limited",
      "Registration Number": "148275",
      CIN: "U52399KA2021PTC148275",
      PAN: "AAGCS1234D",
      TAN: "BLRS12345E",
      "Date of Incorporation": "18 March 2021",
      "Registered Office Address": SUNSPIRE_REGISTERED_ADDRESS,
      "Company Type": "Private Company Limited by Shares",
    },
    fieldConfidence: {
      "Company Name": 0.99,
      "Registration Number": 0.98,
      CIN: 0.99,
      PAN: 0.97,
      TAN: 0.96,
      "Date of Incorporation": 0.97,
      "Registered Office Address": 0.96,
      "Company Type": 0.95,
    },
    overallConfidence: 0.97,
  },

  /** The authorised signatory. Screening runs against this person. */
  REPRESENTATIVE_ID: {
    documentCode: "REPRESENTATIVE_ID",
    label: "Aadhaar (sample)",
    fields: {
      Name: "Arjun Mehta",
      "Date of Birth": "14/08/1991",
      Gender: "Male",
      "Identification Number": "4821 7734 1196",
      Address:
        "Flat 4B, Lake View Residency, 18 CMH Road, Indiranagar, Bengaluru, Karnataka - 560038",
    },
    fieldConfidence: {
      Name: 0.99,
      "Date of Birth": 0.99,
      Gender: 0.98,
      "Identification Number": 0.98,
      Address: 0.95,
    },
    overallConfidence: 0.98,
  },

  TAX_REGISTRATION: {
    documentCode: "TAX_REGISTRATION",
    label: "GST Registration Certificate",
    fields: {
      "Legal Name": "Sunspire Retail Private Limited",
      "Trade Name": "Sunspire Retail",
      GSTIN: "29AAQCS4582L1Z9",
      PAN: "AAQCS4582L",
      "Constitution of Business": "Private Limited Company",
      "Principal Place of Business": SUNSPIRE_REGISTERED_ADDRESS,
      "Effective Date of Registration": "01/04/2021",
      "State Jurisdiction": "Karnataka",
    },
    fieldConfidence: {
      "Legal Name": 0.99,
      "Trade Name": 0.97,
      GSTIN: 0.99,
      PAN: 0.98,
      "Constitution of Business": 0.96,
      "Principal Place of Business": 0.96,
      "Effective Date of Registration": 0.97,
      "State Jurisdiction": 0.98,
    },
    overallConfidence: 0.97,
  },

  /**
   * The planted address discrepancy.
   *
   * The bill's *billing* address matches the registered office, but the
   * *service* address is a different premises in a different postcode. An
   * extraction that returns only the billing address would miss the mismatch
   * entirely, so both are ground truth.
   */
  ADDRESS_PROOF: {
    documentCode: "ADDRESS_PROOF",
    label: "BharatTel Business Landline Bill",
    fields: {
      "Subscriber Name": "Sunspire Retail Private Limited",
      "Billing Address": SUNSPIRE_REGISTERED_ADDRESS,
      "Service Address":
        "201, 4th Cross, Peenya Industrial Area, Bengaluru, Karnataka 560058",
      "Account Number": "1045872391",
      "Bill Date": "05/08/2026",
      "Amount Due": "INR 4,862.00",
    },
    fieldConfidence: {
      "Subscriber Name": 0.99,
      "Billing Address": 0.97,
      "Service Address": 0.97,
      "Account Number": 0.99,
      "Bill Date": 0.98,
      "Amount Due": 0.98,
    },
    overallConfidence: 0.98,
  },

  /** Insurance: states sprinklers ARE installed. */
  PROPOSAL_FORM: {
    documentCode: "PROPOSAL_FORM",
    label: "ShieldSure Commercial Insurance Proposal Form",
    fields: {
      "Proposer Name": "Sunspire Retail Private Limited",
      "Contact Person": "Arjun Mehta",
      Designation: "Chief Operating Officer",
      "Risk Location": "No. 22, Hosur Main Road, Bengaluru, Karnataka 560029",
      "Sum Insured": "INR 2,50,00,000",
      "Fire Protection System": "Sprinklers Installed - YES",
      Occupancy: "Warehouse (Storage) and Office",
      "Total Built-up Area": "25,000 sq. ft.",
      "Year of Construction": "2018",
    },
    fieldConfidence: {
      "Proposer Name": 0.99,
      "Contact Person": 0.98,
      Designation: 0.96,
      "Risk Location": 0.96,
      "Sum Insured": 0.97,
      "Fire Protection System": 0.97,
      Occupancy: 0.95,
      "Total Built-up Area": 0.96,
      "Year of Construction": 0.97,
    },
    overallConfidence: 0.97,
  },

  /** Insurance: the surveyor says they are NOT. This is the contradiction. */
  RISK_QUESTIONNAIRE: {
    documentCode: "RISK_QUESTIONNAIRE",
    label: "ShieldSure Risk Assessment Questionnaire",
    fields: {
      Insured: "Sunspire Retail Private Limited",
      "Site Address": "No. 22, Hosur Main Road, Bengaluru, Karnataka 560029",
      "Fire Alarm System": "YES",
      "CCTV Surveillance": "YES",
      "Security Guard 24x7": "NO",
      "Sprinklers Installed": "NO",
      "Hazardous Materials Stored": "NO",
      "Inspector Name": "Rohan Kumar",
      "Date of Inspection": "20/05/2026",
    },
    fieldConfidence: {
      Insured: 0.99,
      "Site Address": 0.96,
      "Fire Alarm System": 0.98,
      "CCTV Surveillance": 0.98,
      "Security Guard 24x7": 0.97,
      "Sprinklers Installed": 0.98,
      "Hazardous Materials Stored": 0.96,
      "Inspector Name": 0.97,
      "Date of Inspection": 0.98,
    },
    overallConfidence: 0.97,
  },

  /** Telecom: 1 Gbps is ordered. Serviceability will only offer 500 Mbps. */
  SERVICE_ORDER: {
    documentCode: "SERVICE_ORDER",
    label: "BharatConnect Enterprise Service Order",
    fields: {
      "Customer Name": "Sunspire Retail Private Limited",
      "Contact Person": "Arjun Mehta",
      "Registered Address": SUNSPIRE_REGISTERED_ADDRESS,
      "Installation Site":
        "Plot 8, Electronic City Phase 1, Bengaluru, Karnataka 560100",
      "Requested Service": "Dedicated Internet Leased Line",
      "Requested Bandwidth": "1 Gbps",
      "Contract Term": "24 Months",
      GSTIN: "29AABCS1234K1Z5",
      "Order Number": "BC/ESO/2026/0825/1427",
    },
    fieldConfidence: {
      "Customer Name": 0.99,
      "Contact Person": 0.98,
      "Registered Address": 0.96,
      "Installation Site": 0.96,
      "Requested Service": 0.97,
      "Requested Bandwidth": 0.99,
      "Contract Term": 0.97,
      GSTIN: 0.98,
      "Order Number": 0.97,
    },
    overallConfidence: 0.97,
  },

  /** Telecom: evidence of the site, and of the bandwidth actually delivered. */
  SITE_ADDRESS_PROOF: {
    documentCode: "SITE_ADDRESS_PROOF",
    label: "Karnataka Power Supply electricity bill",
    fields: {
      "Consumer Name": "Sunspire Retail Private Limited",
      "Supply Address":
        "Plot 8, Electronic City Phase 1, Bengaluru, Karnataka 560100",
      "Consumer Number": "KP-560100-77213",
      "Connection Type": "Commercial (LT-3)",
      "Amount Due": "INR 58,940.00",
    },
    fieldConfidence: {
      "Consumer Name": 0.99,
      "Supply Address": 0.96,
      "Consumer Number": 0.98,
      "Connection Type": 0.96,
      "Amount Due": 0.98,
    },
    overallConfidence: 0.97,
  },

  /** Evidence of what BharatConnect actually delivers at the site today. */
  EXISTING_SERVICE_INVOICE: {
    documentCode: "EXISTING_SERVICE_INVOICE",
    label: "BharatConnect Enterprise Invoice",
    fields: {
      "Customer Name": "Sunspire Retail Private Limited",
      "Billing Address": SUNSPIRE_REGISTERED_ADDRESS,
      "Service ID": "BC-ILL-560100-0182",
      Plan: "Dedicated Internet 500 Mbps",
      "Invoice Number": "INV-2026-08-11842",
      "Total Amount Due": "INR 62,540.00",
    },
    fieldConfidence: {
      "Customer Name": 0.99,
      "Billing Address": 0.97,
      "Service ID": 0.98,
      Plan: 0.98,
      "Invoice Number": 0.99,
      "Total Amount Due": 0.98,
    },
    overallConfidence: 0.98,
  },

  /**
   * The corrected telephone bill.
   *
   * Same subscriber and account as ADDRESS_PROOF, but the service address now
   * equals the registered office. This is what the customer supplies during
   * the correction loop, and re-running the address check against it is what
   * lets the case proceed.
   */
  ADDRESS_PROOF_CORRECTED: {
    documentCode: "ADDRESS_PROOF_CORRECTED",
    label: "BharatTel Business Landline Bill (corrected)",
    fields: {
      "Subscriber Name": "Sunspire Retail Private Limited",
      "Billing Address": SUNSPIRE_REGISTERED_ADDRESS,
      "Service Address": SUNSPIRE_REGISTERED_ADDRESS,
      "Account Number": "1045872391",
      "Bill Date": "05/09/2026",
      "Amount Due": "INR 4,780.00",
    },
    fieldConfidence: {
      "Subscriber Name": 0.99,
      "Billing Address": 0.98,
      "Service Address": 0.98,
      "Account Number": 0.99,
      "Bill Date": 0.98,
      "Amount Due": 0.98,
    },
    overallConfidence: 0.98,
  },

  PROPERTY_SCHEDULE: {
    documentCode: "PROPERTY_SCHEDULE",
    label: "ShieldSure Property Schedule",
    fields: {
      Insured: "Sunspire Retail Private Limited",
      "Risk Location": "No. 22, Hosur Main Road, Bengaluru, Karnataka 560029",
      "Total Sum Insured": "INR 2,50,00,000",
      "Building and Civil Works": "INR 1,10,00,000",
      "Stock in Trade": "INR 78,00,000",
      Occupancy: "Warehouse (Storage) and Office",
    },
    fieldConfidence: {
      Insured: 0.99,
      "Risk Location": 0.96,
      "Total Sum Insured": 0.98,
      "Building and Civil Works": 0.97,
      "Stock in Trade": 0.97,
      Occupancy: 0.95,
    },
    overallConfidence: 0.97,
  },

  SITE_AUTHORISATION: {
    documentCode: "SITE_AUTHORISATION",
    label: "Site Installation Authorisation",
    fields: {
      "Authorised By": "Arjun Mehta, Chief Operating Officer",
      "Installation Site":
        "Plot 8, Electronic City Phase 1, Bengaluru, Karnataka 560100",
      "Related Service Order": "BC/ESO/2026/0825/1427",
      Reference: "SRPL/AUTH/2026/0084",
    },
    fieldConfidence: {
      "Authorised By": 0.97,
      "Installation Site": 0.96,
      "Related Service Order": 0.98,
      Reference: 0.97,
    },
    overallConfidence: 0.97,
  },
};

/** The address a journey should be checked against, per industry. */
export const REGISTERED_ADDRESS_TEXT = SUNSPIRE_REGISTERED_ADDRESS;
