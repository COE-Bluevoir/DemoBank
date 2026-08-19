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

/**
 * The full agent-response JSON — every extracted field, the planted
 * discrepancy, and (once screening has run) every check outcome — shaped
 * the way this app's own extraction/screening agents would actually report
 * it, not just the handful of properties `Document`/`CheckResult` can hold.
 *
 * Written into `pyNote` (see `mirrorExtractionForScriptedMode` and
 * `mirrorScreeningForScriptedMode` in adapter.ts): there is no dedicated
 * `AgentResponse` property on this case type yet — confirmed live
 * 2026-08-19, see docs/pega-demo-mode-flag-handoff.md — and `pyNote` is a
 * large Text-Area field that round-trips a JSON blob this size intact,
 * unlike the 256-char-limited Text properties that truncated it earlier
 * this session.
 */
export function scriptedAgentResponseJson(options: {
  addressCorrected: boolean;
  checkProfile?: CheckProfile;
}): string {
  const documents = BANKING_DOCUMENT_CODES.map((code) => {
    const source =
      code === "ADDRESS_PROOF" && options.addressCorrected
        ? EXPECTED_EXTRACTIONS.ADDRESS_PROOF_CORRECTED
        : EXPECTED_EXTRACTIONS[code];

    return {
      code,
      label: EXPECTED_EXTRACTIONS[code].label,
      fields: source?.fields ?? {},
      fieldConfidence: source?.fieldConfidence ?? {},
      confidence: source?.overallConfidence ?? 0,
    };
  });

  const addressProof = options.addressCorrected
    ? EXPECTED_EXTRACTIONS.ADDRESS_PROOF_CORRECTED
    : EXPECTED_EXTRACTIONS.ADDRESS_PROOF;
  const addressMismatch =
    !options.addressCorrected &&
    addressProof?.fields["Billing Address"] !== addressProof?.fields["Service Address"];

  const payload: Record<string, unknown> = {
    agent: "DocumentExtractionAgent",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    documents,
    discrepancies: addressMismatch
      ? [
          {
            field: "Address",
            documentA: "ADDRESS_PROOF.Billing Address",
            documentB: "ADDRESS_PROOF.Service Address",
            valueA: addressProof?.fields["Billing Address"],
            valueB: addressProof?.fields["Service Address"],
            classification: "CORRECTABLE",
          },
        ]
      : [],
  };

  if (options.checkProfile) {
    payload.screening = scriptedCheckRows(options.checkProfile).map((row) => ({
      check: row.CheckResultName,
      status: row.CheckStatus,
      confidence: row.ConfidenceLevel,
    }));
  }

  return JSON.stringify(payload);
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
