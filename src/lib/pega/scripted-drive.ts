import { requirePegaConfig } from "@/lib/config/env";
import { dxCaseResponseSchema } from "@/lib/pega/dx-schemas";
import { PegaHttpClient } from "@/lib/pega/http-client";
import { logServerError } from "@/lib/observability/logger";

/**
 * Mirrors ground-truth data into the real Pega case, bypassing the flow
 * shapes that call the (currently unreliable) live GenAI agents.
 *
 * Verified live against `bv-infax-261.pegademo.com` on 2026-08-18 —
 * see docs/pega-step-contract.md for the picklist values these rely on.
 *
 * Two primitives, both sanctioned Pega DX API v2 mechanisms rather than a
 * workaround:
 *  - `pyUpdateCaseDetails` is a case-wide "Edit details" action. It writes
 *    `Document`/`CheckResult`/`Execution` page lists by merge — a row with a
 *    matching key is updated in place, not replaced. Nested rows must NOT
 *    include `classID`/`pyGUID`; Pega assigns those, and including them
 *    yourself is rejected outright.
 *  - `PUT /cases/{id}/stages/{stageID}` jumps the case straight to a stage.
 *    The target stage's own entry automation still runs; whatever the
 *    *skipped* stages would have written does not happen, which is exactly
 *    why the content write above always runs first.
 *
 * Every call here is best-effort: this exists to keep a case a presenter
 * might open in Pega later consistent with what the customer was shown, not
 * to drive the customer-facing journey — that stays exactly as reliable as
 * it already is, driven by this app's own fixture data, whether or not the
 * mirror below succeeds.
 */

export interface ScriptedDocumentRow {
  DocumentName: string;
  DocumentType: string;
  DocumentNumber?: string;
}

export interface ScriptedCheckRow {
  CheckResultName: string;
  CheckStatus: "Passed" | "Failed" | "Pending" | "Needs review";
  CheckType: "Sanctions" | "PEP" | "Duplicate customer" | "Document fraud" | "Blacklist";
  ConfidenceLevel: number;
}

export interface ScriptedExecutionRow {
  ExecutionName: string;
  AgentName: string;
  CorrelationID: string;
}

export interface ScriptedContent {
  Document?: ScriptedDocumentRow[];
  CheckResult?: ScriptedCheckRow[];
  Execution?: ScriptedExecutionRow[];
  /**
   * Everything else the case genuinely needs — `Applicant`, `Address`,
   * `Consent`, `ProductIntent` and the like. Typed loosely because the
   * caller builds this from `toPegaContent`, the same content-shaping
   * function the real flow-action submission uses, so it stays one place
   * rather than a second, drifting copy of Pega's field names.
   */
  [key: string]: unknown;
}

/** Primary stages of `ODHMNT-AgenticC-Work-CustomerOnboardingUnified`. */
export type ScriptedStageId =
  | "PRIM1" // Capture Details
  | "PRIM2" // Verify Identity
  | "PRIM3" // Perform Screening
  | "PRIM4" // Resolve Exceptions
  | "PRIM5" // Create Customer
  | "PRIM6"; // Complete

let sharedClient: PegaHttpClient | undefined;

function client(): PegaHttpClient {
  return (sharedClient ??= new PegaHttpClient(requirePegaConfig()));
}

async function currentEditEtag(
  caseId: string,
  correlationId?: string,
): Promise<string | undefined> {
  const { eTag } = await client().requestWithMeta({
    method: "GET",
    path: `/cases/${encodeURIComponent(caseId)}/actions/pyUpdateCaseDetails`,
    schema: dxCaseResponseSchema,
    correlationId,
    query: { viewType: "form" },
  });

  return eTag;
}

async function writeScriptedContent(
  caseId: string,
  content: ScriptedContent,
  correlationId?: string,
): Promise<void> {
  const eTag = await currentEditEtag(caseId, correlationId);

  await client().requestWithMeta({
    method: "PATCH",
    path: `/cases/${encodeURIComponent(caseId)}/actions/pyUpdateCaseDetails`,
    schema: dxCaseResponseSchema,
    correlationId,
    eTag,
    body: { content },
  });
}

async function jumpToStage(
  caseId: string,
  stageId: ScriptedStageId,
  correlationId?: string,
): Promise<void> {
  const eTag = await currentEditEtag(caseId, correlationId);

  await client().requestWithMeta({
    method: "PUT",
    path: `/cases/${encodeURIComponent(caseId)}/stages/${stageId}`,
    schema: dxCaseResponseSchema,
    correlationId,
    eTag,
    body: {},
  });
}

/**
 * Write ground-truth content and/or jump the stage. Never throws: a failure
 * here is logged and swallowed rather than surfaced, because nothing in the
 * customer-facing journey depends on this succeeding.
 */
export async function mirrorScriptedStep(
  caseId: string,
  step: { content?: ScriptedContent; stage?: ScriptedStageId },
  correlationId?: string,
): Promise<void> {
  try {
    if (step.content) {
      await writeScriptedContent(caseId, step.content, correlationId);
    }

    if (step.stage) {
      await jumpToStage(caseId, step.stage, correlationId);
    }
  } catch (error) {
    logServerError({ scope: "pega-scripted-drive", caseId }, error);
  }
}
