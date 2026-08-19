import { EXPECTED_EXTRACTIONS } from "@/lib/fixtures/expected-extraction";
import type { CheckProfile } from "@/lib/industry/types";
import type {
  ScriptedCheckRow,
  ScriptedDocumentRow,
  ScriptedExecutionRow,
} from "@/lib/pega/scripted-drive";

/**
 * Arjun Mehta's ground truth, translated into Pega's own picklist
 * vocabulary, for `scripted-drive.ts` to write onto the real case.
 *
 * `DocumentType` here uses the fixture's own document codes — Pega's live
 * picklist already carries these exact keys (`INCORPORATION_CERTIFICATE`,
 * `REPRESENTATIVE_ID`, …), confirmed 2026-08-18. `CheckType`/`CheckStatus`
 * are Pega's fixed picklist, which has no entries for this app's own check
 * names, so each maps onto the closest available value — only
 * `CheckResultName` (free text) needs to read correctly to a reviewer.
 */

const BANKING_DOCUMENT_CODES = [
  "INCORPORATION_CERTIFICATE",
  "REPRESENTATIVE_ID",
  "AUTHORIZATION_LETTER",
  "TAX_REGISTRATION",
  "ADDRESS_PROOF",
] as const;

/** The field each document's identifying number is read from. */
const IDENTIFYING_FIELD: Record<(typeof BANKING_DOCUMENT_CODES)[number], string> = {
  INCORPORATION_CERTIFICATE: "CIN",
  REPRESENTATIVE_ID: "Identification Number",
  AUTHORIZATION_LETTER: "Resolution Reference",
  TAX_REGISTRATION: "GSTIN",
  ADDRESS_PROOF: "Account Number",
};

export function scriptedDocumentRows(options?: {
  /** Use the corrected address proof once the customer has resupplied it. */
  addressCorrected?: boolean;
}): ScriptedDocumentRow[] {
  return BANKING_DOCUMENT_CODES.map((code) => {
    const source =
      code === "ADDRESS_PROOF" && options?.addressCorrected
        ? EXPECTED_EXTRACTIONS.ADDRESS_PROOF_CORRECTED
        : EXPECTED_EXTRACTIONS[code];

    return {
      DocumentName: EXPECTED_EXTRACTIONS[code].label,
      DocumentType: code,
      DocumentNumber: source?.fields[IDENTIFYING_FIELD[code]] ?? "",
    };
  });
}

const CHECK_TYPE_BY_KEY: Record<keyof CheckProfile, ScriptedCheckRow["CheckType"]> = {
  verifyEntity: "Document fraud",
  screenParty: "Sanctions",
  checkDuplicate: "Duplicate customer",
  validateAddress: "Document fraud",
  evaluateExternalRisk: "Blacklist",
  checkServiceability: "Document fraud",
};

const CHECK_LABEL_BY_KEY: Record<keyof CheckProfile, string> = {
  verifyEntity: "Entity verification",
  screenParty: "Sanctions & PEP screening",
  checkDuplicate: "Duplicate customer check",
  validateAddress: "Address validation",
  evaluateExternalRisk: "External risk evaluation",
  checkServiceability: "Serviceability check",
};

/** Only the checks this journey's industry pack actually turns on. */
export function scriptedCheckRows(checkProfile: CheckProfile): ScriptedCheckRow[] {
  return (Object.keys(CHECK_LABEL_BY_KEY) as Array<keyof CheckProfile>)
    .filter((key) => checkProfile[key])
    .map((key) => ({
      CheckResultName: CHECK_LABEL_BY_KEY[key],
      CheckStatus: "Passed",
      CheckType: CHECK_TYPE_BY_KEY[key],
      ConfidenceLevel: 0.95,
    }));
}

export function scriptedExecutionRows(
  stage: "extraction" | "screening",
): ScriptedExecutionRow[] {
  const suffix = Date.now();

  if (stage === "extraction") {
    return [
      {
        ExecutionName: "Document Extraction",
        AgentName: "DocumentAgent",
        CorrelationID: `corr-doc-${suffix}`,
      },
      {
        ExecutionName: "Address Validation",
        AgentName: "DocumentAgent",
        CorrelationID: `corr-addr-${suffix}`,
      },
    ];
  }

  return [
    {
      ExecutionName: "Screening",
      AgentName: "ScreeningAgent",
      CorrelationID: `corr-screen-${suffix}`,
    },
    {
      ExecutionName: "Risk Evaluation",
      AgentName: "RiskAgent",
      CorrelationID: `corr-risk-${suffix}`,
    },
  ];
}
