import { randomUUID } from "node:crypto";

import { z } from "zod";

import { requirePegaConfig } from "@/lib/config/env";
import type { DocumentRequirement } from "@/lib/industry/types";
import { getIndustryPack, resolveProductName } from "@/lib/industry/registry";
import { formatFullName } from "@/lib/onboarding/applicant-name";
import { digitsOnly } from "@/lib/onboarding/phone-number";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import { getPegaDemoModeEnabled } from "@/lib/onboarding/pega-demo-mode";
import { mirrorScriptedStep } from "@/lib/pega/scripted-drive";
import {
  scriptedAgentResponseJson,
  scriptedCheckRows,
  scriptedDocumentRows,
  scriptedExecutionRows,
} from "@/lib/pega/scripted-narrative";
import type {
  AssistantMessage,
  CreateOnboardingCaseRequest,
  CreateOnboardingCaseResponse,
  DemoExecutionEvent,
  DocumentUploadResponse,
  DocumentView,
  OnboardingCaseView,
  OnboardingOrchestrationAdapter,
  SubmitCaseActionRequest,
  UploadedDocument,
} from "@/lib/onboarding/types";
import {
  getPegaCaseStateStore,
  type PegaCaseState,
} from "@/lib/pega/case-state-store";
import {
  awaitsProblemFlowResolution,
  mapDxCaseToView,
  primaryAssignment,
} from "@/lib/pega/dx-mapper";
import {
  type DxCaseInfo,
  dxAttachmentListSchema,
  dxAttachmentUploadSchema,
  dxCaseResponseSchema,
  dxCaseTypesResponseSchema,
} from "@/lib/pega/dx-schemas";
import { PegaIntegrationError } from "@/lib/pega/errors";
import { PegaHttpClient } from "@/lib/pega/http-client";
import { logServerError } from "@/lib/observability/logger";
import {
  sampleDocumentBytes,
  sampleDocumentContentType,
} from "@/lib/pega/sample-documents";

/**
 * Add a document to the recorded list, replacing any earlier one answering
 * the same requirement — re-uploading a document supersedes it rather than
 * leaving the customer looking at two. Matched on `documentCode` rather than
 * `kind`: several requirements in a business journey share a kind (an
 * incorporation certificate and a tax certificate are both IDENTITY-class
 * evidence), so matching on kind would drop unrelated documents whenever a
 * second one of the same class came in. Falls back to kind for the rare
 * document with no code, so an older case without one still supersedes
 * correctly.
 */
function recordUploadedDocument(
  existing: unknown,
  document: DocumentView,
): DocumentView[] {
  const current = Array.isArray(existing) ? (existing as DocumentView[]) : [];
  const matches = (item: DocumentView) => {
    if (document.documentCode) {
      return item.documentCode === document.documentCode;
    }

    // Do not collapse other coded IDENTITY/ADDRESS files into this one.
    if (item.documentCode) {
      return false;
    }

    return item.kind === document.kind;
  };

  return [...current.filter((item) => !matches(item)), document];
}

/**
 * CollectAddress attachment properties, keyed by the industry-pack document
 * code the website already uses. Continue maps each upload onto the matching
 * field rather than onto Document(1)…Document(5) by list order.
 */
export const PEGA_EVIDENCE_FIELDS: Record<string, string> = {
  INCORPORATION_CERTIFICATE: "CertificationOfIncorporation",
  REPRESENTATIVE_ID: "AuthorisedSignatoryIdentity",
  AUTHORIZATION_LETTER: "BoardResolution",
  TAX_REGISTRATION: "TaxRegistrationCertificate",
  ADDRESS_PROOF: "BusinessAddressProof",
};

/**
 * Find the properties a flow action's attachment controls write to.
 *
 * Pega marks each one in the view metadata as `@ATTACHMENT .SomeProperty`.
 * Reading it is necessary rather than tidy: which properties a step exposes —
 * and how many — differs per action, so a hardcoded name works for one and is
 * rejected by the other. A step can expose several at once, e.g. one per
 * document in a business banking journey (`Document(1).DocumentFile` through
 * `Document(5).DocumentFile` or the named evidence fields such as
 * `CertificationOfIncorporation`), so every marker is collected, in the
 * order Pega lists them, rather than only the first.
 *
 * Returns the bare property paths — Pega rejects the leading dot on submit
 * even though its own metadata includes it. The path can contain page-list
 * indices and nested properties (`Document(3).DocumentFile`), so the match
 * runs to the next quote rather than stopping at the first non-identifier
 * character.
 */
export function attachmentFieldsFrom(uiResources: unknown): string[] {
  const text = JSON.stringify(uiResources ?? {});
  const named = Object.values(PEGA_EVIDENCE_FIELDS).join("|");
  const fromMarkers = [...text.matchAll(/@ATTACHMENT\s+\.?([^"\\]+)/g)].map(
    (marker) => marker[1],
  );
  const fromValues = [
    ...text.matchAll(
      new RegExp(
        `"value"\\s*:\\s*"\\.?((?:Document\\(\\d+\\)[^"]*|(?:AttachDoc|AddressDoc|UploadDocs|${named})[^"]*))"`,
        "g",
      ),
    ),
  ].map((marker) => marker[1]);

  return [...new Set([...fromMarkers, ...fromValues].map((field) => field.replace(/^\./, "")))];
}

/**
 * True when Pega refused a submission because it contains a property the
 * current view does not define.
 *
 * Distinct from a validation failure about a *value*: this says the case type
 * has not caught up with the integration contract, which is a deployment state
 * rather than a fault in the request.
 */
export function isUnsupportedContentFailure(error: unknown): boolean {
  return (
    error instanceof PegaIntegrationError &&
    /Error_Invalid_Inputs_content|invalid inputs/i.test(
      error.technicalDetail ?? "",
    )
  );
}

/**
 * True when Pega refused a step because it wants a document.
 *
 * Which steps require evidence is Pega's decision and it has changed more than
 * once, so this reacts to what Pega actually says rather than predicting it
 * from an action's name or from the presence of an attachment control —
 * `CreateCaseRecord` offers one it does not require.
 */
function isMissingAttachmentFailure(error: unknown): boolean {
  return (
    error instanceof PegaIntegrationError &&
    // The single-property phrasing ("attachment content is empty") and the
    // per-document phrasing a business banking step uses ("X is required",
    // reported against a `.pxAttachmentKey` identifier) are both Pega saying
    // the same thing: show the uploader, this is not a customer-facing fault.
    /attachment content is empty|upload at least one attachment|pxAttachmentKey|document is required|letter is required/i.test(
      error.technicalDetail ?? "",
    )
  );
}

/**
 * True when Pega rejected the DX `attachments` array itself.
 *
 * Named CollectAddress attachment fields accept the DX `attachments` array.
 * The older `Document(n).DocumentFile` page-list controls do not — those
 * bind through `pageInstructions` instead.
 */
function isInvalidAttachmentDetails(error: unknown): boolean {
  return (
    error instanceof PegaIntegrationError &&
    /Error_Invalid_Attachment_Details|Invalid attachment details/i.test(
      error.technicalDetail ?? "",
    )
  );
}

function isInvalidPageInstructions(error: unknown): boolean {
  return (
    error instanceof PegaIntegrationError &&
    /Error_Invalid_Page_Instructions|invalid page instruction/i.test(
      error.technicalDetail ?? "",
    )
  );
}

function isExecutionError(error: unknown): boolean {
  return (
    error instanceof PegaIntegrationError &&
    /Error_Execution_Error|Execution error|HTTP 500/i.test(
      error.technicalDetail ?? "",
    )
  );
}

function namedAttachmentPagesBound(
  content: Record<string, unknown> | undefined,
  fields: string[],
): boolean {
  if (fields.length === 0) {
    return false;
  }

  return fields.every((field) => {
    const page = content?.[field];
    if (!page || typeof page !== "object") {
      return false;
    }

    const key = (page as Record<string, unknown>).pxAttachmentKey;
    return typeof key === "string" && key.trim().length > 0;
  });
}

function isCollectAddressBindRetryable(error: unknown): boolean {
  if (
    error instanceof PegaIntegrationError &&
    error.kind === "VERSION_CONFLICT"
  ) {
    return true;
  }

  return (
    isUnsupportedContentFailure(error) ||
    isInvalidAttachmentDetails(error) ||
    isInvalidPageInstructions(error) ||
    isMissingAttachmentFailure(error) ||
    isExecutionError(error)
  );
}

/**
 * Live Pega orchestration adapter, speaking the Pega DX API v2.
 *
 * Verified against a Constellation-compatible application exposing the
 * `Customer Onboarding (Unified)` case type. Endpoints used:
 *
 *   GET   /casetypes
 *   POST  /cases
 *   GET   /cases/{caseID}
 *   PATCH /assignments/{assignmentID}/actions/{actionID}
 *   GET   /cases/{caseID}/attachments
 *
 * Pega owns the lifecycle; this adapter owns transport, concurrency and the
 * translation into the normalized case model.
 */

/**
 * Per-case integration state.
 *
 * DX v2 has no `caseVersion` and no correlation ID of its own, and the eTag
 * arrives as a response header rather than in the body — so the values the
 * website's contract requires are tracked here, keyed by Pega case ID.
 *
 * In-memory is adequate for a single instance; a multi-instance deployment
 * should move this to the shared store.
 */
type CaseIntegrationState = PegaCaseState;

/**
 * Upper bound on how many Pega flow actions one customer step may drive.
 *
 * Prevents an unexpected Pega configuration from looping indefinitely.
 */
const MAX_CHAINED_ACTIONS = 8;

/**
 * Scripted mode's mirror calls (see `runDueScriptedMirror` below) now resolve
 * in a couple of seconds rather than the ~70s the live extraction/screening
 * agents used to take. Resolving that fast, synchronously, would skip past
 * `VerificationProgress`'s staged narrative before a presenter — or an
 * executive audience — ever saw it: the response would already carry the
 * final status. These durations hold the customer-visible status one step
 * behind the real mirror just long enough for the existing 2.2s poll
 * (`onboarding-flow.tsx`'s `shouldPoll` effect) to pick up the staged
 * reveal, the same way it always did when Pega's own processing took real
 * wall-clock time.
 */
const SCRIPTED_EXTRACTION_PACING_MS = 6_000;
const SCRIPTED_SCREENING_PACING_MS = 7_000;

/**
 * A scripted-mode mirror this app owes the real case, due once real time has
 * passed rather than once a background timer fires.
 *
 * `setTimeout` does not survive past the response in this request model —
 * confirmed live: a background mirror scheduled that way simply never ran,
 * silently, with nothing in the logs to say so. `dueAt` is a wall-clock
 * deadline instead, checked and (if due) run at the top of every subsequent
 * request for this case — `getCase` (what the frontend's poll calls) and
 * `submitAction` both check it before doing anything else. This works
 * identically whether the process outlives the response or not, which a
 * background timer never could.
 */
interface ScriptedMirrorMarker {
  kind: "extraction" | "screening";
  dueAt: number;
}

/**
 * Load a case's integration state, seeding a default if none is stored.
 *
 * A missing entry is not an error: it happens after a deployment or when a
 * customer returns to a case this instance has not served before.
 */
async function loadState(caseId: string): Promise<CaseIntegrationState> {
  const existing = await getPegaCaseStateStore().get(decodeCaseId(caseId));

  if (existing) {
    return existing;
  }

  return {
    scenarioId: "ADDRESS_PEP_REVIEW",
    industryId: "banking",
    correlationId: `corr-${decodeCaseId(caseId)}`,
    version: 1,
    collected: {},
  };
}

async function saveState(
  caseId: string,
  state: CaseIntegrationState,
): Promise<void> {
  await getPegaCaseStateStore().put(decodeCaseId(caseId), state);
}

function decodeCaseId(caseId: string): string {
  try {
    return decodeURIComponent(caseId);
  } catch {
    return caseId;
  }
}

/**
 * Fold an observation of the live case into the tracked state.
 *
 * The version advances only when Pega reports the case actually moved, so a
 * poll that sees nothing new does not invalidate a form the customer is
 * still filling in.
 */
function recordObservation(
  state: CaseIntegrationState,
  caseInfo: DxCaseInfo,
  eTag: string | undefined,
): CaseIntegrationState {
  const changed =
    caseInfo.lastUpdateTime !== undefined &&
    caseInfo.lastUpdateTime !== state.lastUpdateTime;

  if (changed && state.lastUpdateTime !== undefined) {
    state.version += 1;
  }

  if (caseInfo.lastUpdateTime !== undefined) {
    state.lastUpdateTime = caseInfo.lastUpdateTime;
  }

  if (eTag) {
    state.eTag = eTag;
  }

  return state;
}

export class PegaOrchestrationAdapter implements OnboardingOrchestrationAdapter {
  private readonly client: PegaHttpClient;
  private readonly caseTypeId: string;

  constructor(client?: PegaHttpClient) {
    const config = requirePegaConfig();
    this.client = client ?? new PegaHttpClient(config);
    this.caseTypeId = config.caseTypeId;
  }

  /** Confirm the configured case type exists before a customer relies on it. */
  async listCaseTypes(): Promise<string[]> {
    const response = await this.client.request({
      method: "GET",
      path: "/casetypes",
      schema: dxCaseTypesResponseSchema,
    });

    return (response.caseTypes ?? []).map((caseType) => caseType.ID);
  }

  async createCase(
    request: CreateOnboardingCaseRequest,
  ): Promise<CreateOnboardingCaseResponse> {
    const correlationId = `corr-${randomUUID()}`;
    const pack = getIndustryPack(request.industryId);

    // Create with the properties the deployed case type already accepts.
    // Sending the fuller contract payload first was rejected on every start
    // and added a wasted round trip to connectivity.
    const { data, eTag } = await this.client.requestWithMeta({
      method: "POST",
      path: "/cases",
      schema: dxCaseResponseSchema,
      correlationId,
      // A retried create must never open a second onboarding case.
      idempotencyKey: correlationId,
      query: { viewType: "none" },
      body: {
        caseTypeID: this.caseTypeId,
        content: {
          ProductIntent: resolveProductName(pack, request.productCode),
        },
      },
    });

    const caseInfo = data.data.caseInfo;

    await saveState(caseInfo.ID, {
      scenarioId: request.scenarioId,
      industryId: request.industryId,
      correlationId,
      version: 1,
      eTag,
      lastUpdateTime: caseInfo.lastUpdateTime,
      // Seeded so later steps that ask for the product again can answer —
      // the resolved display name, not the raw code: `toPegaContent` sends
      // whatever is here straight through as `ProductIntent`, and every
      // later submission (including scripted mode's mirror) would otherwise
      // overwrite the name this case was created with with its own code.
      collected: { productIntent: resolveProductName(pack, request.productCode) },
    });

    return {
      caseId: caseInfo.ID,
      caseVersion: 1,
      correlationId,
      status: "STARTED",
      nextUrl: `/onboarding/${encodeURIComponent(caseInfo.ID)}`,
    };
  }

  async getCase(caseId: string): Promise<OnboardingCaseView> {
    await this.runDueScriptedMirror(caseId);
    const { caseInfo, state } = await this.readCase(caseId);

    return mapDxCaseToView(caseInfo, {
      scenarioId: state.scenarioId,
      industryId: state.industryId,
      caseVersion: state.version,
      correlationId: state.correlationId,
      collected: state.collected,
    });
  }

  async submitAction(
    caseId: string,
    request: SubmitCaseActionRequest,
  ): Promise<OnboardingCaseView> {
    await this.runDueScriptedMirror(caseId);
    const { caseInfo, state } = await this.readCase(caseId);

    if (request.actionId === "USE_DEMO_DOCUMENTS") {
      state.collected = {
        ...state.collected,
        documentsProvided: true,
        awaitingDocumentUpload: false,
      };
      await saveState(caseId, state);
      return this.attachSampleDocuments(caseId);
    }

    if (request.actionId === "CONTINUE_DOCUMENTS") {
      const uploaded = Array.isArray(state.collected.documents)
        ? state.collected.documents
        : [];

      if (uploaded.length === 0) {
        throw new PegaIntegrationError("VALIDATION", {
          technicalDetail: "Continue requires at least one uploaded attachment.",
          correlationId: state.correlationId,
        });
      }

      await this.handoverDocumentsResilient(caseId);
      // Due later, not run now: see `ScriptedMirrorMarker`. The view
      // returned below reflects the case as it stands right now — documents
      // provided, real stage not yet jumped — which `mapDxStatus` already
      // reads as VERIFYING_DOCUMENTS, giving the customer a genuine (if
      // brief) verification-in-progress screen instead of an instant jump
      // to the discrepancy screen.
      await this.scheduleExtractionMirror(caseId);

      const latest = await this.readCase(caseId);
      return mapDxCaseToView(latest.caseInfo, {
        scenarioId: latest.state.scenarioId,
        industryId: latest.state.industryId,
        caseVersion: latest.state.version,
        correlationId: latest.state.correlationId,
        collected: latest.state.collected,
      });
    }

    if (
      request.actionId === "CONFIRM_ADDRESS" &&
      getPegaDemoModeEnabled() &&
      state.collected.addressMismatchPending === true
    ) {
      state.collected = {
        ...state.collected,
        // Carries `selectedAddress`/`confirmed` — read by
        // `mirrorScreeningForScriptedMode` via `toPegaContent` to write a
        // real `Address` page onto the case, and skipped everywhere else in
        // this special-cased branch, unlike the generic path below which
        // always merges `request.data`.
        ...(request.data ?? {}),
        addressMismatchPending: false,
        addressConfirmed: true,
        // Read by `mapDxStatus` as SCREENING_IN_PROGRESS until the due
        // mirror below runs — same pacing purpose as `addressMismatchPending`
        // above, one stage further on.
        screeningPending: true,
        scriptedMirror: {
          kind: "screening",
          dueAt: Date.now() + SCRIPTED_SCREENING_PACING_MS,
        } satisfies ScriptedMirrorMarker,
      };
      await saveState(caseId, state);

      const latest = await this.readCase(caseId);
      return mapDxCaseToView(latest.caseInfo, {
        scenarioId: latest.state.scenarioId,
        industryId: latest.state.industryId,
        caseVersion: latest.state.version,
        correlationId: latest.state.correlationId,
        collected: latest.state.collected,
      });
    }

    const assignment = primaryAssignment(caseInfo);

    if (!assignment) {
      throw new PegaIntegrationError("VALIDATION", {
        technicalDetail: `Case ${caseId} has no open assignment to act on.`,
        correlationId: state.correlationId,
      });
    }

    if (awaitsProblemFlowResolution(caseInfo)) {
      return mapDxCaseToView(caseInfo, {
        scenarioId: state.scenarioId,
        industryId: state.industryId,
        caseVersion: state.version,
        correlationId: state.correlationId,
        collected: state.collected,
      });
    }

    // Pega's agent queue opens an assignment that offers no actions. There is
    // nothing for the customer to submit against it, so the case is reported
    // as in progress rather than as a failure.
    if ((assignment.actions ?? []).length === 0) {
      return mapDxCaseToView(caseInfo, {
        scenarioId: state.scenarioId,
        industryId: state.industryId,
        caseVersion: state.version,
        correlationId: state.correlationId,
        collected: state.collected,
      });
    }

    // Prefer the flow action the browser echoed back; fall back to the first
    // action Pega offers on the open assignment.
    const flowActionId =
      assignment.actions?.find((action) => action.ID === request.actionId)?.ID ??
      assignment.actions?.[0]?.ID;

    if (!flowActionId) {
      throw new PegaIntegrationError("VALIDATION", {
        technicalDetail: `Assignment ${assignment.ID} exposes no flow action.`,
        correlationId: state.correlationId,
      });
    }

    // Ask Pega which fields this flow action actually exposes. Submitting a
    // property the current view does not contain is rejected outright, and the
    // set differs per action, so it cannot be hardcoded here.
    const view = await this.readAssignmentAction(assignment.ID, flowActionId);

    // Everything the customer has given so far, so a later Pega action that
    // asks again is answered without re-prompting them.
    state.collected = { ...state.collected, ...(request.data ?? {}) };
    await saveState(caseId, state);
    const content = toPegaContent(state.collected, {
      correlationId: state.correlationId,
    });

    // Pega may be waiting on a step the customer has not yet reached in the
    // website's own order. Record what they gave and stop, rather than
    // answering Pega on their behalf.
    const gateLabel = `${assignment.name ?? ""} ${flowActionId}`;
    if (isGated(gateLabel, state.collected)) {
      await this.syncCustomerOnboardingName(caseId);
      return mapDxCaseToView(caseInfo, {
        scenarioId: state.scenarioId,
        industryId: state.industryId,
        caseVersion: state.version,
        correlationId: state.correlationId,
        collected: state.collected,
      });
    }

    let data;
    let eTag;

    try {
      ({ data, eTag } = await this.client.requestWithMeta({
        method: "PATCH",
        path: `/assignments/${encodeURIComponent(assignment.ID)}/actions/${encodeURIComponent(flowActionId)}`,
        schema: dxCaseResponseSchema,
        correlationId: state.correlationId,
        // The action's own eTag is the one Pega validates on write.
        eTag: view.eTag ?? state.eTag,
        idempotencyKey: `${caseId}:${request.actionId}:${request.expectedCaseVersion}`,
        body: {
          content: (() => {
            const filtered = restrictToAcceptedFields(
              conformToAllowedValues(content, view.fields, PICKLIST_FIELDS),
              view.acceptedFields,
              view.knownFields,
            );
            const onboardingName = text(content.CustomerOnboardingName);

            if (
              onboardingName &&
              (view.acceptedFields.has("CustomerOnboardingName") ||
                view.knownFields.has("CustomerOnboardingName"))
            ) {
              filtered.CustomerOnboardingName = onboardingName;
            }

            return filtered;
          })(),
        },
      }));
    } catch (error) {
      // Pega wants a document at this step. Show the uploader rather than an
      // error: the customer has something to do, and nothing has gone wrong.
      if (isMissingAttachmentFailure(error)) {
        state.collected.awaitingDocumentUpload = true;
        await saveState(caseId, state);

        await this.syncCustomerOnboardingName(caseId);

        return mapDxCaseToView(caseInfo, {
          scenarioId: state.scenarioId,
          industryId: state.industryId,
          caseVersion: state.version,
          correlationId: state.correlationId,
          collected: state.collected,
        });
      }

      throw error;
    }

    await saveState(caseId, recordObservation(state, data.data.caseInfo, eTag));

    // One customer step can satisfy several consecutive Pega flow actions.
    // Keep driving until the customer actually has something new to do.
    const caseInfoAfter = await this.advanceWhileStepUnchanged(
      caseId,
      data.data.caseInfo,
      content,
    );

    const updated = await loadState(caseId);

    // Hold the customer at the document step until they have actually
    // provided evidence.
    //
    // Pega's flow no longer stops for documents — it accepts the details and
    // runs ahead to its own extraction step — so without this the customer is
    // never asked for anything and the journey jumps from consent to "being
    // verified" with no evidence behind it. The case has still moved in Pega;
    // this governs what the customer is asked for, and the files are handed
    // over as soon as they give them.
    if (
      updated.collected.accepted === true &&
      updated.collected.documentsProvided !== true
    ) {
      updated.collected.awaitingDocumentUpload = true;
      await saveState(caseId, updated);
    }

    await this.syncCustomerOnboardingName(caseId);

    return mapDxCaseToView(caseInfoAfter, {
      scenarioId: updated.scenarioId,
      industryId: updated.industryId,
      caseVersion: updated.version,
      correlationId: updated.correlationId,
      collected: updated.collected,
    });
  }

  /**
   * Drive Pega forward while the customer-visible step stays the same.
   *
   * Pega decomposes one business step into several flow actions. Returning
   * after the first would re-render the same screen with nothing to do, so the
   * website submits the data it already holds until the customer-facing step
   * genuinely changes — or until Pega asks for an assignment it cannot satisfy.
   */
  private async advanceWhileStepUnchanged(
    caseId: string,
    startingCaseInfo: DxCaseInfo,
    content: Record<string, unknown>,
  ): Promise<DxCaseInfo> {
    const initialState = await loadState(caseId);

    const stepSignature = (info: DxCaseInfo, state: CaseIntegrationState) => {
      const view = mapDxCaseToView(info, {
        scenarioId: state.scenarioId,
        industryId: state.industryId,
        caseVersion: state.version,
        correlationId: state.correlationId,
        collected: state.collected,
      });

      // The UI branches on status and on whether it already holds applicant
      // details, so both together define "the step the customer is on".
      return `${view.status}|${view.applicant ? "applicant" : "none"}`;
    };

    const startingStep = stepSignature(startingCaseInfo, initialState);
    let caseInfo = startingCaseInfo;

    for (let index = 0; index < MAX_CHAINED_ACTIONS; index += 1) {
      const state = await loadState(caseId);

      if (stepSignature(caseInfo, state) !== startingStep) {
        return caseInfo;
      }

      const assignment = primaryAssignment(caseInfo);
      const nextActionId = assignment?.actions?.[0]?.ID;

      if (!assignment || !nextActionId) {
        return caseInfo;
      }

      // Never auto-advance past a step that needs an explicit customer act,
      // and never submit into Pega's error-recovery flow.
      if (
        awaitsProblemFlowResolution(caseInfo) ||
        isGated(`${assignment.name ?? ""} ${nextActionId}`, state.collected)
      ) {
        return caseInfo;
      }

      const view = await this.readAssignmentAction(assignment.ID, nextActionId);
      const outgoingContent = restrictToAcceptedFields(
        conformToAllowedValues(content, view.fields, PICKLIST_FIELDS),
        view.acceptedFields,
        view.knownFields,
      );

      let data;
      let eTag;

      try {
        ({ data, eTag } = await this.client.requestWithMeta({
          method: "PATCH",
          path: `/assignments/${encodeURIComponent(assignment.ID)}/actions/${encodeURIComponent(nextActionId)}`,
          schema: dxCaseResponseSchema,
          correlationId: state.correlationId,
          eTag: view.eTag ?? state.eTag,
          body: {
            content: outgoingContent,
          },
        }));
      } catch (error) {
        // Pega is asking for a document here. That is a step for the customer,
        // not a failure: record it so the page shows the uploader, and leave
        // the case where it is.
        if (isMissingAttachmentFailure(error)) {
          state.collected.awaitingDocumentUpload = true;
          await saveState(caseId, state);
          return caseInfo;
        }

        throw error;
      }

      const previousUpdateTime = caseInfo.lastUpdateTime;
      caseInfo = data.data.caseInfo;
      await saveState(caseId, recordObservation(state, caseInfo, eTag));

      // Pega accepted the call but the case did not move: stop rather than
      // spin against an assignment this step cannot satisfy.
      if (caseInfo.lastUpdateTime === previousUpdateTime) {
        return caseInfo;
      }
    }

    return caseInfo;
  }

  /**
   * Register an uploaded document against the case.
   *
   * The binary stays in this application's storage; Pega receives the
   * reference and pulls the content from the evidence endpoint, so document
   * bytes never transit a browser-to-Pega request.
   */
  async uploadDocument(
    caseId: string,
    document: UploadedDocument,
  ): Promise<DocumentUploadResponse> {
    const stored = document.storageReference
      ? await getDocumentStorage().get(document.storageReference)
      : null;

    if (!stored) {
      throw new PegaIntegrationError("VALIDATION", {
        technicalDetail: `No stored content found for ${document.kind} document on case ${caseId}.`,
      });
    }

    const documentId = document.storageReference ?? randomUUID();
    const uploadState = await loadState(caseId);
    uploadState.collected.documents = recordUploadedDocument(
      uploadState.collected.documents,
      {
        documentId,
        documentCode: document.documentCode,
        kind: document.kind,
        fileName: document.fileName,
        fileType: document.fileType,
        fileSize: document.fileSize,
        status: "UPLOADED",
        source: document.source === "demo" ? "demo" : "upload",
        evidenceReference: documentId,
        storageReference: document.storageReference,
      },
    );

    // Continue (or Use sample documents) is what submits the pack to Pega.
    uploadState.collected.documentsProvided = false;
    uploadState.collected.awaitingDocumentUpload = true;
    await saveState(caseId, uploadState);

    return {
      documentId,
      fileName: document.fileName,
      status: "UPLOADED",
      evidenceReference: documentId,
    };
  }

  /**
   * Attach the bundled sample documents for every mandatory requirement in
   * the case's own industry pack.
   *
   * Used by the presenter shortcut in place of live file selection; the
   * files are the real synthetic evidence under `public/sample-docs/`. All
   * are uploaded before anything is submitted, then cited to Pega together —
   * a business banking step exposes one attachment property per document, and
   * submitting them one at a time would have each submission's page-list
   * update overwrite the ones before it.
   */
  private async attachSampleDocuments(
    caseId: string,
  ): Promise<OnboardingCaseView> {
    await this.handoverDocumentsResilient(caseId);
    // Due later, not run now — same pacing reason as the CONTINUE_DOCUMENTS
    // path. `getCase` below checks the marker itself and, called this soon
    // after setting it, correctly finds nothing due yet.
    await this.scheduleExtractionMirror(caseId);
    return this.getCase(caseId);
  }

  /** Set an `extraction`-kind `ScriptedMirrorMarker`, due after the pacing delay. */
  private async scheduleExtractionMirror(caseId: string): Promise<void> {
    const state = await loadState(caseId);

    if (!getPegaDemoModeEnabled() || state.industryId !== "banking") {
      return;
    }

    state.collected = {
      ...state.collected,
      scriptedMirror: {
        kind: "extraction",
        dueAt: Date.now() + SCRIPTED_EXTRACTION_PACING_MS,
      } satisfies ScriptedMirrorMarker,
    };
    await saveState(caseId, state);
  }

  /**
   * Submit the documents to Pega, skipping the slow part when scripted mode
   * will take over anyway.
   *
   * `handoverDocumentsToPega` normally submits the real CollectAddress flow
   * action after registering attachments, and that submission is what runs
   * into the live extraction agent's wait shape — slow enough to exceed even
   * the 60s ceiling on `PEGA_TIMEOUT_MS` on its own, before any agent
   * flakiness is even in play. In scripted mode that confirmation is not
   * needed: `mirrorExtractionForScriptedMode` writes the outcome directly and
   * forces the stage forward regardless, so this stops right after the
   * (fast, reliable) attachment registration. Outside scripted mode nothing
   * changes here. Kept resilient to a genuine failure either way — a scripted
   * demo must never hard-fail on something the mirror step is about to paper
   * over regardless.
   */
  private async handoverDocumentsResilient(caseId: string): Promise<void> {
    const state = await loadState(caseId);
    const scripted = getPegaDemoModeEnabled() && state.industryId === "banking";

    try {
      await this.handoverDocumentsToPega(caseId, {
        fillMissingWithSamples: true,
        skipFlowActionSubmit: scripted,
      });
      await this.syncCustomerOnboardingName(caseId);
    } catch (error) {
      if (!scripted) {
        throw error;
      }

      logServerError({ scope: "pega-scripted-drive", caseId }, error);
    }
  }

  /**
   * Run whichever scripted-mode mirror is due for this case, if any.
   *
   * Called at the top of both `getCase` (the frontend's poll) and
   * `submitAction`, so a marker set by `scheduleExtractionMirror` or the
   * `CONFIRM_ADDRESS` handling below gets picked up by whichever request
   * happens to land after its `dueAt` passes — no background timer, no
   * process required to stay alive between requests. Best-effort: the
   * marker is cleared before the mirror runs, so a failure here is logged
   * and swallowed rather than leaving the case stuck retrying forever.
   */
  private async runDueScriptedMirror(caseId: string): Promise<void> {
    const state = await loadState(caseId);
    const pending = state.collected.scriptedMirror as
      | ScriptedMirrorMarker
      | undefined;

    if (!pending || Date.now() < pending.dueAt) {
      return;
    }

    state.collected = { ...state.collected, scriptedMirror: undefined };
    await saveState(caseId, state);

    try {
      if (pending.kind === "extraction") {
        await this.mirrorExtractionForScriptedMode(caseId);
      } else {
        await this.mirrorScreeningForScriptedMode(caseId);
      }
    } catch (error) {
      logServerError({ scope: "pega-scripted-drive", caseId }, error);
    }
  }

  /**
   * Scripted mode: mirror Arjun Mehta's ground truth onto the real case and
   * flag the planted address mismatch locally, so the customer sees the
   * discrepancy screen instead of waiting on the live extraction agent's
   * wait shape. Called from every path that hands documents to Pega
   * (`CONTINUE_DOCUMENTS` and the `USE_DEMO_DOCUMENTS` shortcut both submit
   * the same CollectAddress action underneath). Best-effort — the mirror
   * itself never throws — so a failure here cannot affect what the customer
   * is shown.
   */
  private async mirrorExtractionForScriptedMode(caseId: string): Promise<void> {
    const state = await loadState(caseId);

    if (!getPegaDemoModeEnabled() || state.industryId !== "banking") {
      return;
    }

    await mirrorScriptedStep(
      caseId,
      {
        content: {
          // The applicant's own details — name, mobile, email, whatever the
          // customer has actually given so far — via the same content-shaping
          // function the real flow-action submission uses, so the case a
          // presenter opens in Pega afterward is genuinely filled in rather
          // than carrying only the document list this mode adds on top.
          ...pegaUpdateCaseDetailsContent(state),
          Document: scriptedDocumentRows(),
          Execution: scriptedExecutionRows("extraction"),
          // The full extraction result as the agent itself would report
          // it — every field, every confidence score, the planted
          // discrepancy — not just what Document[] can hold.
          pyNote: scriptedAgentResponseJson({ addressCorrected: false }),
        },
        // Forces the real case past whatever the live extraction automation
        // left it at — including a problem-flow assignment — since scripted
        // mode exists precisely because that automation is unreliable.
        stage: "PRIM2",
      },
      state.correlationId,
    );

    const scripted = await loadState(caseId);
    scripted.collected = {
      ...scripted.collected,
      addressMismatchPending: true,
      // Once scripted mode has taken over narrating a case, its own local
      // status must stay authoritative for the rest of the case's life —
      // including once the real case reaches Complete. The live automation
      // this mode bypasses keeps running in Pega after the app stops
      // waiting on it, and can leave its own now-irrelevant problem-flow
      // assignment behind; without this flag that stale assignment would
      // shadow a genuinely successful scripted completion.
      scriptedDriveActive: true,
    };
    await saveState(caseId, scripted);
  }

  /**
   * Scripted mode: mirror the screening outcome onto the real case, jump it
   * to Complete, and clear `screeningPending` so status derivation stops
   * synthesizing SCREENING_IN_PROGRESS and falls through to the real
   * (now-Complete) stage. Set up by the `CONFIRM_ADDRESS` handling above via
   * a `ScriptedMirrorMarker`, run later by `runDueScriptedMirror`.
   */
  private async mirrorScreeningForScriptedMode(caseId: string): Promise<void> {
    const state = await loadState(caseId);

    if (!getPegaDemoModeEnabled() || state.industryId !== "banking") {
      return;
    }

    const pack = getIndustryPack(state.industryId);

    await mirrorScriptedStep(
      caseId,
      {
        content: {
          // Carries the confirmed `Address` page — `state.collected` now
          // holds `selectedAddress` from the CONFIRM_ADDRESS submission —
          // through the same content-shaping function the real flow-action
          // submission uses.
          ...pegaUpdateCaseDetailsContent(state),
          Document: scriptedDocumentRows({ addressCorrected: true }),
          CheckResult: scriptedCheckRows(pack.checkProfile),
          Execution: scriptedExecutionRows("screening"),
          // Supersedes the extraction-stage pyNote with the complete
          // record — corrected address, every screening outcome included.
          pyNote: scriptedAgentResponseJson({
            addressCorrected: true,
            checkProfile: pack.checkProfile,
          }),
        },
        stage: "PRIM6",
      },
      state.correlationId,
    );

    const finished = await loadState(caseId);
    finished.collected = { ...finished.collected, screeningPending: false };
    await saveState(caseId, finished);
  }

  /**
   * Upload a file to Pega's attachment store.
   *
   * Returns the upload's ID, which the flow action then cites to attach it to
   * the case. Uploading does not by itself associate the file with anything.
   */
  private async uploadAttachment(
    caseId: string,
    file: { fileName: string; contentType: string; content: Uint8Array },
  ): Promise<string> {
    const state = await loadState(caseId);

    const uploaded = await this.client.uploadFile({
      path: "/attachments/upload",
      fileName: file.fileName,
      contentType: file.contentType,
      content: file.content,
      correlationId: state.correlationId,
      schema: dxAttachmentUploadSchema,
    });

    return uploaded.ID;
  }

  /**
   * Put the file bytes on the case attachment list.
   *
   * Staging `/attachments/upload` IDs are not shown in Pega until they are
   * bound. Posting the file itself to `/cases/{id}/attachments` is what the
   * Attachments gadget lists.
   */
  private async attachBinaryToCase(
    caseId: string,
    file: { fileName: string; contentType: string; content: Uint8Array },
  ): Promise<boolean> {
    const state = await loadState(caseId);

    try {
      await this.client.uploadFile({
        path: `/cases/${encodeURIComponent(caseId)}/attachments`,
        fileName: file.fileName,
        contentType: file.contentType,
        content: file.content,
        correlationId: state.correlationId,
        schema: z.unknown(),
      });
      return true;
    } catch (error) {
      logServerError(
        {
          scope: "pega",
          correlationId: state.correlationId,
          caseId,
          detail: `Direct case attach of ${file.fileName} failed; will try staging IDs.`,
        },
        error,
      );
      return false;
    }
  }

  /**
   * Find the step that is waiting for a document, advancing past those that
   * are not.
   *
   * Pega collects the identity proof and the address proof at different
   * steps, separated by steps that take no file at all. Submitting the
   * document wherever the case happens to sit would either attach it to the
   * wrong step or fail with an error about an empty attachment.
   */
  private async locateAttachmentStep(caseId: string, needsAttachment: boolean) {
    for (let index = 0; index < MAX_CHAINED_ACTIONS; index += 1) {
      const { caseInfo, state } = await this.readCase(caseId);
      const assignment = primaryAssignment(caseInfo);
      const flowActionId = assignment?.actions?.[0]?.ID;

      if (!assignment || !flowActionId || awaitsProblemFlowResolution(caseInfo)) {
        return undefined;
      }

      const view = await this.readAssignmentAction(assignment.ID, flowActionId);
      const looksLikeDocumentStep =
        /collectaddress|collect address|uploaddoc|attachdoc|providedocument/i.test(
          `${assignment.name ?? ""} ${flowActionId}`,
        );

      if (
        !needsAttachment ||
        view.attachmentFields.length > 0 ||
        looksLikeDocumentStep
      ) {
        return { assignment, flowActionId, view, state };
      }

      // This step takes no file. Answer it from what the customer already
      // gave and keep looking for the one that does.
      const content = toPegaContent(state.collected, {
        correlationId: state.correlationId,
      });

      try {
        const { data, eTag } = await this.client.requestWithMeta({
          method: "PATCH",
          path: `/assignments/${encodeURIComponent(assignment.ID)}/actions/${encodeURIComponent(flowActionId)}`,
          schema: dxCaseResponseSchema,
          correlationId: state.correlationId,
          eTag: view.eTag ?? state.eTag,
          body: {
            content: restrictToAcceptedFields(
              conformToAllowedValues(content, view.fields, PICKLIST_FIELDS),
              view.acceptedFields,
              view.knownFields,
            ),
          },
        });

        const previousUpdateTime = caseInfo.lastUpdateTime;
        await saveState(caseId, recordObservation(state, data.data.caseInfo, eTag));

        // Pega accepted the call but the case did not move: stop rather than
        // spin against a step this document cannot satisfy.
        if (data.data.caseInfo.lastUpdateTime === previousUpdateTime) {
          return undefined;
        }
      } catch (error) {
        if (isMissingAttachmentFailure(error) && needsAttachment) {
          return { assignment, flowActionId, view, state };
        }

        throw error;
      }
    }

    return undefined;
  }

  /**
   * Upload the five mandatory documents and cite each one on CollectAddress.
   *
   * Each file is bound to the matching named attachment field
   * (`CertificationOfIncorporation`, `AuthorisedSignatoryIdentity`,
   * `BoardResolution`, `TaxRegistrationCertificate`, `BusinessAddressProof`)
   * using a fresh `/attachments/upload` ID. The same bytes are also posted to
   * `/cases/{id}/attachments` so the files appear in the Attachments utility.
   */
  private async handoverDocumentsToPega(
    caseId: string,
    options: {
      fillMissingWithSamples: boolean;
      /**
       * Skip submitting the CollectAddress flow action once attachments are
       * registered. Scripted mode uses this: that submission is what runs
       * into the live extraction agent's wait shape (routinely exceeding
       * `PEGA_TIMEOUT_MS` on its own), and `mirrorExtractionForScriptedMode`
       * force-jumps the stage afterward regardless of whether it ran.
       * Skipping it turns a ~70s round trip that is going to be overridden
       * anyway into the sub-second attachment registration alone.
       */
      skipFlowActionSubmit?: boolean;
    },
  ): Promise<void> {
    const initialState = await loadState(caseId);
    const pack = getIndustryPack(initialState.industryId);
    const requirements = pack.documentProfile.filter((item) => item.mandatory);
    const existingDocuments = Array.isArray(initialState.collected.documents)
      ? (initialState.collected.documents as DocumentView[])
      : [];
    const known = new Map(
      existingDocuments
        .filter((doc) => doc.documentCode)
        .map((doc) => [doc.documentCode as string, doc]),
    );

    const prepared: Array<{
      requirement: DocumentRequirement;
      attachmentId: string;
      fileName: string;
      fileType: string;
      fileSize: number;
      source: DocumentView["source"];
      storageReference?: string;
    }> = [];
    const usedStorageKeys = new Set<string>();

    for (const requirement of requirements) {
      const existing = known.get(requirement.code);
      const storageKey = existing?.storageReference;
      const stored =
        storageKey && !usedStorageKeys.has(storageKey)
          ? await getDocumentStorage().get(storageKey)
          : null;

      if (!stored && !options.fillMissingWithSamples) {
        continue;
      }

      if (stored && storageKey) {
        usedStorageKeys.add(storageKey);
      }

      const content = stored?.content ?? (await sampleDocumentBytes(requirement));
      const fileName = stored
        ? existing?.fileName ?? requirement.sampleFile
        : requirement.sampleFile;
      const contentType = stored
        ? stored.metadata.fileType || existing?.fileType || sampleDocumentContentType(requirement)
        : sampleDocumentContentType(requirement);
      const source: DocumentView["source"] = stored
        ? existing?.source === "demo"
          ? "demo"
          : "upload"
        : "demo";

      const attachmentId = await this.uploadAttachment(caseId, {
        fileName,
        contentType,
        content,
      });

      prepared.push({
        requirement,
        attachmentId,
        fileName,
        fileType: contentType,
        fileSize: content.byteLength,
        source,
        storageReference: existing?.storageReference,
      });
    }

    if (prepared.length === 0) {
      throw new PegaIntegrationError("VALIDATION", {
        technicalDetail: "No documents were available to send to Pega.",
        correlationId: initialState.correlationId,
      });
    }

    const recorded = await loadState(caseId);
    for (const item of prepared) {
      recorded.collected.documents = recordUploadedDocument(
        recorded.collected.documents,
        {
          documentId: item.attachmentId,
          documentCode: item.requirement.code,
          kind: item.requirement.kind,
          fileName: item.fileName,
          fileType: item.fileType,
          fileSize: item.fileSize,
          status: "UPLOADED",
          source: item.source,
          evidenceReference: item.attachmentId,
          storageReference: item.storageReference,
        },
      );
    }
    recorded.collected.verificationStartedAt =
      recorded.collected.verificationStartedAt ?? new Date().toISOString();
    await saveState(caseId, recorded);

    // Register each upload in Pega's attachment store under its specific
    // business category — confirmed (both by Pega-side rule inspection and
    // by live testing) to be what `pxIsAttachmentOfCategoryInCase` actually
    // checks. Neither the generic "File" category nor citing the upload
    // inside the flow action's own content/pageInstructions satisfies it;
    // the named per-field `/save` binding attempted below additionally
    // returns HTTP 500/400 on this Pega instance regardless of body shape,
    // so this direct category POST is the reliable path, done unconditionally
    // before anything else touches the assignment.
    for (const item of prepared) {
      const category = PEGA_EVIDENCE_FIELDS[item.requirement.code] ?? "File";

      try {
        await this.client.request({
          method: "POST",
          path: `/cases/${encodeURIComponent(caseId)}/attachments`,
          schema: z.unknown(),
          correlationId: recorded.correlationId,
          body: {
            attachments: [
              {
                type: "File",
                category,
                ID: item.attachmentId,
                name: item.fileName,
              },
            ],
          },
        });
      } catch (error) {
        logServerError(
          {
            scope: "pega",
            correlationId: recorded.correlationId,
            caseId,
            detail: `Category-tagged attach failed for ${item.requirement.code} (category=${category})`,
          },
          error,
        );
      }
    }

    if (options.skipFlowActionSubmit) {
      const finalState = await loadState(caseId);
      finalState.collected.documentsProvided = true;
      finalState.collected.awaitingDocumentUpload = false;
      await saveState(caseId, finalState);
      return;
    }

    const located = await this.locateAttachmentStep(caseId, true);
    const contentPayload = toPegaContent(recorded.collected, {
      correlationId: recorded.correlationId,
    });

    if (!located) {
      // Nothing open to submit against — the attachments are already
      // correctly categorised on the case from the loop above, which is all
      // `pxIsAttachmentOfCategoryInCase` actually checks.
      const finalState = await loadState(caseId);
      finalState.collected.documentsProvided = true;
      finalState.collected.awaitingDocumentUpload = false;
      await saveState(caseId, finalState);
      return;
    }

    const { assignment, flowActionId, view, state } = located;
    const baseContent = restrictToAcceptedFields(
      contentPayload,
      view.acceptedFields,
      view.knownFields,
    );
    delete baseContent.Document;
    for (const field of Object.values(PEGA_EVIDENCE_FIELDS)) {
      delete baseContent[field];
    }

    // No attachment content belongs in this submission at all: the category
    // registration above is a case-level, database-backed fact that
    // `pxIsAttachmentOfCategoryInCase` reads directly, independent of
    // whatever this PATCH body contains.
    try {
      const { data, eTag } = await this.client.requestWithMeta({
        method: "PATCH",
        path: `/assignments/${encodeURIComponent(assignment.ID)}/actions/${encodeURIComponent(flowActionId)}`,
        schema: dxCaseResponseSchema,
        correlationId: state.correlationId,
        eTag: view.eTag ?? state.eTag,
        body: { content: baseContent },
      });
      await saveState(caseId, recordObservation(state, data.data.caseInfo, eTag));
      await this.advanceWhileStepUnchanged(caseId, data.data.caseInfo, contentPayload);
    } catch (error) {
      logServerError(
        {
          scope: "pega",
          correlationId: state.correlationId,
          caseId,
          detail:
            "CollectAddress submit failed after category-tagged attachment registration.",
        },
        error,
      );
      throw error;
    }

    const finalState = await loadState(caseId);
    finalState.collected.documentsProvided = true;
    finalState.collected.awaitingDocumentUpload = false;
    await saveState(caseId, finalState);
  }

  /**
   * Bind staging uploads to the case so they appear in Pega's attachment list.
   *
   * `/attachments/upload` only parks the file. Pega shows it on the case after
   * `POST /cases/{id}/attachments` with those staging IDs.
   */
  private async linkAttachmentsToCase(
    caseId: string,
    files: Array<{ attachmentId: string; fileName: string }>,
  ): Promise<boolean> {
    const state = await loadState(caseId);

    try {
      await this.client.request({
        method: "POST",
        path: `/cases/${encodeURIComponent(caseId)}/attachments`,
        schema: z.unknown(),
        correlationId: state.correlationId,
        body: {
          attachments: files.map((file) => ({
            type: "File",
            category: "File",
            ID: file.attachmentId,
            name: file.fileName,
          })),
        },
      });
      return true;
    } catch (batchError) {
      logServerError(
        {
          scope: "pega",
          correlationId: state.correlationId,
          caseId,
          detail: `Batch case-level attach failed; trying each file. IDs: ${files.map((file) => file.attachmentId).join(", ")}`,
        },
        batchError,
      );
    }

    let attached = 0;

    for (const file of files) {
      try {
        await this.client.request({
          method: "POST",
          path: `/cases/${encodeURIComponent(caseId)}/attachments`,
          schema: z.unknown(),
          correlationId: state.correlationId,
          body: {
            attachments: [
              {
                type: "File",
                category: "File",
                ID: file.attachmentId,
                name: file.fileName,
              },
            ],
          },
        });
        attached += 1;
      } catch (error) {
        logServerError(
          {
            scope: "pega",
            correlationId: state.correlationId,
            caseId,
            detail: `Could not attach ${file.fileName} (${file.attachmentId}) to the case.`,
          },
          error,
        );
      }
    }

    return attached > 0;
  }

  private async listCaseAttachments(caseId: string) {
    const state = await loadState(caseId);

    try {
      const data = await this.client.request({
        method: "GET",
        path: `/cases/${encodeURIComponent(caseId)}/attachments`,
        schema: dxAttachmentListSchema,
        correlationId: state.correlationId,
      });
      return data.attachments ?? [];
    } catch (error) {
      logServerError(
        {
          scope: "pega",
          correlationId: state.correlationId,
          caseId,
          detail: "Could not list case attachments.",
        },
        error,
      );
      return [];
    }
  }

  /**
   * Conversational messages are a mock-mode concept with no DX equivalent.
   * Returning an empty list is honest; synthesising chat from case data would
   * put words in the bank's mouth that no approved template produced.
   */
  async getMessages(): Promise<AssistantMessage[]> {
    return [];
  }


  /** Internal timeline derived from Pega's own stage history. */
  async getEvents(caseId: string): Promise<DemoExecutionEvent[]> {
    const { caseInfo, state } = await this.readCase(caseId);

    return (caseInfo.stages ?? [])
      .filter((stage) => stage.visited_status !== "future")
      .map((stage, index) => ({
        id: `${caseId}-stage-${stage.ID}`,
        caseId,
        correlationId: state.correlationId,
        timestamp: stage.entryTime ?? caseInfo.lastUpdateTime ?? new Date().toISOString(),
        category: "CASE" as const,
        displayName: stage.name,
        status:
          stage.visited_status === "active"
            ? ("STARTED" as const)
            : ("SUCCEEDED" as const),
        summary: `Stage ${index + 1}: ${stage.name}`,
        technicalDetails: { stageId: stage.ID, workStatus: caseInfo.status },
      }));
  }

  /**
   * Read a flow action's view to learn its editable fields and current eTag.
   *
   * Pega returns the action's own content page, whose keys are exactly the
   * properties the action will accept on submit.
   */
  private async readAssignmentAction(assignmentId: string, actionId: string) {
    const { data, eTag } = await this.client.requestWithMeta({
      method: "GET",
      // The form view is what carries the field metadata. Without asking for
      // it Pega may answer with content alone, and the attachment control's
      // target property — which differs per action — cannot be discovered.
      query: { viewType: "form" },
      path: `/assignments/${encodeURIComponent(assignmentId)}/actions/${encodeURIComponent(actionId)}`,
      schema: dxCaseResponseSchema,
    });

    const notReserved = (key: string) =>
      !PEGA_RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix));

    return {
      eTag,
      // Which properties this action's attachment controls write to, read
      // from the action rather than assumed: a step can expose one shared
      // attachment property or several document-specific ones, and citing
      // the wrong one is rejected as invalid attachment details.
      attachmentFields: attachmentFieldsFrom(data.uiResources),
      // Top-level properties this action will accept.
      acceptedFields: new Set(
        Object.keys(data.data.caseInfo.content ?? {}).filter(notReserved),
      ),
      // Every property the view knows about, including those inside embedded
      // pages. Used to filter nested page content so the website never invents
      // a property name Pega has not defined.
      knownFields: new Set(
        Object.keys(data.uiResources?.resources?.fields ?? {}).filter(notReserved),
      ),
      fields: data.uiResources?.resources?.fields ?? {},
      content: (data.data.caseInfo.content ?? {}) as Record<string, unknown>,
    };
  }

  /**
   * Read a case-wide action (for example Edit details) so
   * CustomerOnboardingName can be written after case create.
   */
  private async readCaseAction(caseId: string, actionId: string) {
    const { data, eTag } = await this.client.requestWithMeta({
      method: "GET",
      query: { viewType: "form" },
      path: `/cases/${encodeURIComponent(caseId)}/actions/${encodeURIComponent(actionId)}`,
      schema: dxCaseResponseSchema,
    });

    const notReserved = (key: string) =>
      !PEGA_RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix));

    return {
      eTag,
      acceptedFields: new Set(
        Object.keys(data.data.caseInfo.content ?? {}).filter(notReserved),
      ),
      knownFields: new Set(
        Object.keys(data.uiResources?.resources?.fields ?? {}).filter(notReserved),
      ),
    };
  }

  /**
   * Write first + last name onto Pega's CustomerOnboardingName.
   *
   * CreateCaseRecord is the only flow action that used to accept the
   * property, and it has already run before the website captures the name.
   * PATCH `/cases/{id}` returns 405 here. The DX case action
   * `pyUpdateCaseDetails` is the supported write.
   */
  private async syncCustomerOnboardingName(caseId: string): Promise<void> {
    const state = await loadState(caseId);
    const firstName = text(state.collected.firstName) ?? "";
    const lastName = text(state.collected.lastName) ?? "";
    const fullName = formatFullName({ firstName, lastName });

    if (!fullName) {
      return;
    }

    const latest = await this.readCase(caseId);
    const actionIds = [
      "pyUpdateCaseDetails",
      ...(latest.caseInfo.availableActions ?? []).map((action) => action.ID),
    ].filter(
      (actionId, index, all) =>
        Boolean(actionId) &&
        !/changestage|change.?stage/i.test(actionId) &&
        all.indexOf(actionId) === index,
    );

    const nameContent: Record<string, unknown> = {
      CustomerOnboardingName: fullName,
      Applicant: {
        ApplicantName: fullName,
        FirstName: firstName || undefined,
        LastName: lastName || undefined,
      },
    };

    for (const actionId of actionIds) {
      try {
        let eTag = latest.state.eTag;
        let content: Record<string, unknown> = {
          CustomerOnboardingName: fullName,
        };

        // `pyUpdateCaseDetails`'s `Applicant` control is a single-reference
        // Combobox bound only to `ApplicantName` — confirmed live
        // 2026-08-19 (see `pegaUpdateCaseDetailsContent`). Its own
        // `knownFields` still lists `FirstName`/`LastName` (they're real
        // properties of the underlying Data-Applicant class, just not ones
        // *this* control writes), so the generic filter below is too
        // permissive here and the whole PATCH gets rejected. Every other
        // action id is a genuine flow action whose view has historically
        // accepted the fuller shape, so only this one gets the minimal form.
        if (actionId === "pyUpdateCaseDetails") {
          content = {
            CustomerOnboardingName: fullName,
            Applicant: { ApplicantName: fullName },
          };
          try {
            eTag = (await this.readCaseAction(caseId, actionId)).eTag ?? eTag;
          } catch {
            // The action may still accept a PATCH without a form view.
          }
        } else {
          try {
            const view = await this.readCaseAction(caseId, actionId);
            eTag = view.eTag ?? eTag;
            const filtered = restrictToAcceptedFields(
              nameContent,
              view.acceptedFields,
              view.knownFields,
            );
            if (
              view.acceptedFields.has("CustomerOnboardingName") ||
              view.knownFields.has("CustomerOnboardingName")
            ) {
              filtered.CustomerOnboardingName = fullName;
            }
            content =
              Object.keys(filtered).length > 0
                ? filtered
                : { CustomerOnboardingName: fullName };
          } catch {
            // The action may still accept a PATCH without a form view.
          }
        }

        const { data, eTag: nextTag } = await this.client.requestWithMeta({
          method: "PATCH",
          path: `/cases/${encodeURIComponent(caseId)}/actions/${encodeURIComponent(actionId)}`,
          schema: dxCaseResponseSchema,
          correlationId: latest.state.correlationId,
          eTag,
          body: { content },
        });
        await saveState(
          caseId,
          recordObservation(latest.state, data.data.caseInfo, nextTag),
        );
        return;
      } catch (error) {
        logServerError(
          {
            scope: "pega",
            correlationId: latest.state.correlationId,
            caseId,
            detail: `Case action ${actionId} did not accept CustomerOnboardingName="${fullName}".`,
          },
          error,
        );
      }
    }

    const assignment = primaryAssignment(latest.caseInfo);
    const flowActionId = assignment?.actions?.[0]?.ID;

    if (!assignment || !flowActionId) {
      return;
    }

    try {
      const view = await this.readAssignmentAction(assignment.ID, flowActionId);
      const { data, eTag } = await this.client.requestWithMeta({
        method: "PATCH",
        path: `/assignments/${encodeURIComponent(assignment.ID)}/actions/${encodeURIComponent(flowActionId)}/save`,
        schema: dxCaseResponseSchema,
        correlationId: latest.state.correlationId,
        eTag: view.eTag ?? latest.state.eTag,
        body: { content: { CustomerOnboardingName: fullName } },
      });
      await saveState(
        caseId,
        recordObservation(latest.state, data.data.caseInfo, eTag),
      );
    } catch (error) {
      logServerError(
        {
          scope: "pega",
          correlationId: latest.state.correlationId,
          caseId,
          detail: `Could not set CustomerOnboardingName to "${fullName}".`,
        },
        error,
      );
    }
  }

  private async readCase(caseId: string) {
    const { data, eTag } = await this.client.requestWithMeta({
      method: "GET",
      path: `/cases/${encodeURIComponent(caseId)}`,
      schema: dxCaseResponseSchema,
    });

    const caseInfo = data.data.caseInfo;
    const state = recordObservation(await loadState(caseId), caseInfo, eTag);
    await saveState(caseId, state);

    return { caseInfo, state };
  }
}


/**
 * Flow actions the website must never auto-submit on the customer's behalf.
 *
 * Pega sequences some steps earlier than the website presents them - consent
 * sits in its Initiate stage, before details are captured. Advancing through
 * those blindly would record a consent the customer never gave, and attach
 * documents they never provided. Each gate opens only once the corresponding
 * explicit customer action has happened.
 */
const CUSTOMER_GATES: Array<{
  pattern: RegExp;
  satisfied: (collected: Record<string, unknown>) => boolean;
}> = [
  {
    pattern: /consent/i,
    satisfied: (collected) => collected.accepted === true,
  },
  {
    pattern: /upload|attach|provide document|submit document/i,
    satisfied: (collected) => collected.documentsProvided === true,
  },
];

/**
 * True when this action needs an explicit customer act that has not happened.
 */
function isGated(
  actionLabel: string,
  collected: Record<string, unknown>,
): boolean {
  return CUSTOMER_GATES.some(
    (gate) => gate.pattern.test(actionLabel) && !gate.satisfied(collected),
  );
}

/**
 * Identifies this website in Pega's execution audit trail.
 *
 * Pega's `Execution` page list records which agent or channel drove a step;
 * the digital journey is one of several possible actors on a case.
 */
const DIGITAL_CHANNEL_AGENT = "NorthStar Digital Onboarding";

/** Pega-internal property prefixes that are never customer-submittable. */
const PEGA_RESERVED_PREFIXES = ["px", "py", "pz", "classID"];

/**
 * Keep only the properties the current Pega view accepts.
 *
 * Anything else is dropped rather than sent, because Pega rejects the whole
 * submission if it contains a property the action does not expose.
 */
function restrictToAcceptedFields(
  content: Record<string, unknown>,
  acceptedFields: Set<string>,
  knownFields: Set<string> = new Set(),
): Record<string, unknown> {
  // An empty allowlist means the action exposes no editable fields; submitting
  // an empty body still advances the assignment.
  if (acceptedFields.size === 0) {
    return {};
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(content)) {
    if (!acceptedFields.has(key)) {
      continue;
    }

    // Embedded pages and page lists are filtered property by property: Pega
    // rejects the whole submission if a page contains a property it does not
    // define, and each case type defines a different set.
    if (Array.isArray(value)) {
      // Empty rows must keep their index. Dropping them shifts later files
      // into Document(1), Document(2), … and Pega then reports the original
      // slots (Board Resolution in Document(3), address proof in Document(5))
      // as missing.
      const rows = value.map((row) => filterPageProperties(row, knownFields));

      if (rows.some((row) => Object.keys(row).length > 0)) {
        result[key] = rows;
      }

      continue;
    }

    if (value && typeof value === "object") {
      const page = filterPageProperties(value, knownFields);

      if (Object.keys(page).length > 0) {
        result[key] = page;
      }

      continue;
    }

    result[key] = value;
  }

  return result;
}

/**
 * Allowed values for a field Pega renders as a dropdown.
 *
 * Pega validates these server-side and rejects the whole submission on a value
 * outside the list, so the permitted set is read from the view rather than
 * assumed. Returns an empty list for free-text fields.
 */
function allowedValuesFor(
  fields: Record<string, unknown>,
  fieldName: string,
): string[] {
  const raw = fields[fieldName];
  // Pega returns either the definition or a single-element array of it.
  const definition = (Array.isArray(raw) ? raw[0] : raw) as
    | { datasource?: { records?: Array<{ key?: unknown }> } }
    | undefined;

  return (definition?.datasource?.records ?? [])
    .map((record) => record?.key)
    .filter((key): key is string => typeof key === "string" && key.length > 0);
}

/**
 * Pega CollectAddress validates these five Document slots by label.
 * Values are tried against the action picklist when one is present.
 */
const PEGA_DOCUMENT_TYPE_BY_CODE: Record<string, string[]> = {
  INCORPORATION_CERTIFICATE: ["Certificate of Incorporation"],
  REPRESENTATIVE_ID: ["Authorised Signatory ID", "Authorized Signatory ID"],
  AUTHORIZATION_LETTER: [
    "Board Resolution / Authorisation Letter",
    "Board Resolution",
    "Authorisation Letter",
  ],
  TAX_REGISTRATION: [
    "GST / Tax Registration Certificate",
    "GST Registration Certificate",
  ],
  ADDRESS_PROOF: ["Business Address Proof"],
};

function pegaDocumentType(
  documentCode: string,
  kind: UploadedDocument["kind"],
  allowed: string[],
): string | undefined {
  const candidates = PEGA_DOCUMENT_TYPE_BY_CODE[documentCode] ?? [];

  if (allowed.length > 0) {
    for (const candidate of candidates) {
      const exact = allowed.find(
        (option) => option.toLowerCase() === candidate.toLowerCase(),
      );
      if (exact) {
        return exact;
      }

      const partial = allowed.find((option) => {
        const normalised = option.toLowerCase();
        const label = candidate.toLowerCase();
        return normalised.includes(label) || label.includes(normalised);
      });
      if (partial) {
        return partial;
      }
    }

    return pickDocumentType(kind, documentCode, allowed);
  }

  return candidates[0] ?? pickDocumentType(kind, documentCode, allowed);
}

function collectAddressAttachmentFields(
  discovered: string[],
  count: number,
): string[] {
  const ranked = [...new Set(discovered)]
    .filter((field) => /Document\(\d+\)/.test(field))
    .sort((left, right) => {
      const leftIndex = Number(/Document\((\d+)\)/.exec(left)?.[1] ?? 0);
      const rightIndex = Number(/Document\((\d+)\)/.exec(right)?.[1] ?? 0);
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex;
      }

      const leftIsFile = /DocumentFile/i.test(left) ? 0 : 1;
      const rightIsFile = /DocumentFile/i.test(right) ? 0 : 1;
      return leftIsFile - rightIsFile;
    });

  const bySlot = new Map<number, string>();

  for (const field of ranked) {
    const slot = Number(/Document\((\d+)\)/.exec(field)?.[1] ?? 0);
    if (slot < 1 || bySlot.has(slot)) {
      continue;
    }

    bySlot.set(
      slot,
      /DocumentFile|Attach/i.test(field) ? field : `${field.replace(/\.$/, "")}.DocumentFile`,
    );
  }

  return Array.from({ length: count }, (_, index) => {
    const slot = index + 1;
    return bySlot.get(slot) ?? `Document(${slot}).DocumentFile`;
  });
}

/**
 * Choose the CollectAddress attachment property for one uploaded document.
 *
 * Only returns a name the live view actually exposes. Citing a property that
 * is not on CollectAddress (for example `BoardResolution` before it is added
 * to the form) is `Error_Invalid_Attachment_Details`.
 */
export function resolvePegaAttachmentField(
  documentCode: string,
  discovered: string[],
): string | undefined {
  const intended = PEGA_EVIDENCE_FIELDS[documentCode];
  const candidates = intended
    ? [intended, intended.replace("Authorised", "Authorized")]
    : [];
  const cleaned = [...new Set(discovered)].map((field) =>
    field.replace(/^\./, "").replace(/\.pxAttachmentKey$/i, ""),
  );

  for (const name of candidates) {
    const exact = cleaned.find(
      (field) =>
        field === name ||
        field.endsWith(`.${name}`) ||
        field.split(".").pop()?.toLowerCase() === name.toLowerCase(),
    );
    if (exact) {
      return exact;
    }
  }

  const pageList = cleaned.find((field) => /Document\(\d+\)\.DocumentFile/i.test(field));
  return pageList;
}

/**
 * Bind staging uploads onto CollectAddress attachment properties.
 *
 * Named evidence fields (`CertificationOfIncorporation`, …) are cited by
 * document code. If the view still uses the Document page list, files fall
 * back to `Document(n).DocumentFile` in pack order.
 */
export function documentSlotPageInstructions(
  fields: string[],
  files: Array<{ attachmentId: string; documentCode?: string }>,
): Array<{
  instruction: "REPLACE";
  target: string;
  content: { ID: string };
}> {
  return files.flatMap((file, index) => {
    const target = file.documentCode
      ? resolvePegaAttachmentField(file.documentCode, fields)
      : collectAddressAttachmentFields(fields, files.length)[index];

    if (!target) {
      return [];
    }

    return [
      {
        instruction: "REPLACE" as const,
        target: `.${target}`,
        content: { ID: file.attachmentId },
      },
    ];
  });
}

function documentAttachmentField(fields: string[], index: number): string {
  return collectAddressAttachmentFields(fields, index + 1)[index];
}

/**
 * Choose a document type Pega will accept for the given evidence kind.
 *
 * Preferences are tried in order against the list Pega actually offers, so a
 * change to that list cannot break the journey; `Other` is the safety net, and
 * `undefined` means the field is omitted entirely.
 */
function pickDocumentType(
  kind: UploadedDocument["kind"],
  documentCode: string | undefined,
  allowed: string[],
): string | undefined {
  if (allowed.length === 0) {
    return undefined;
  }

  // Prefer a value that names this specific document — an incorporation
  // certificate and a tax certificate are both IDENTITY-kind evidence, and a
  // picklist that distinguishes them should not be flattened to whichever
  // generic option happens to come first.
  if (documentCode) {
    const words = documentCode.toLowerCase().split("_");
    const specific = allowed.find((option) => {
      const normalised = option.toLowerCase();
      return words.every((word) => normalised.includes(word));
    });

    if (specific) {
      return specific;
    }
  }

  const preferences =
    kind === "IDENTITY"
      ? ["Passport", "Aadhaar card", "PAN card", "Driver license", "Voter ID"]
      : ["Utility bill", "Bank statement"];

  const match = preferences.find((preference) => allowed.includes(preference));

  return match ?? (allowed.includes("Other") ? "Other" : allowed[0]);
}

/**
 * Replace a value with one the action's dropdown actually offers.
 *
 * The industry packs choose their own vocabulary — insurance offers "Retired"
 * where banking offers "Student" — but Pega runs one common flow whose lists
 * are fixed. Sending a value outside the list fails the whole submission, so
 * an unlisted answer falls back to `Other` where the list provides it.
 *
 * A field Pega does not present as a dropdown is left exactly as given.
 */
export function conformToAllowedValues(
  content: Record<string, unknown>,
  fields: Record<string, unknown>,
  fieldNames: readonly string[],
): Record<string, unknown> {
  const conformed = { ...content };

  for (const fieldName of fieldNames) {
    const value = conformed[fieldName];
    const allowed = allowedValuesFor(fields, fieldName);

    if (typeof value !== "string" || allowed.length === 0) {
      continue;
    }

    if (allowed.includes(value)) {
      continue;
    }

    // Dropping the value silently would look like the customer answered
    // nothing; `Other` is the honest equivalent of an unlisted answer.
    if (allowed.includes("Other")) {
      conformed[fieldName] = "Other";
    } else {
      delete conformed[fieldName];
    }
  }

  return conformed;
}

/** Properties Pega presents as fixed lists on the employment step. */
const PICKLIST_FIELDS = [
  "EmploymentStatus",
  "IncomeRange",
  "TaxResidency",
] as const;

function fieldIsKnown(key: string, knownFields: Set<string>): boolean {
  if (knownFields.size === 0 || knownFields.has(key)) {
    return true;
  }

  for (const field of knownFields) {
    if (field.endsWith(`.${key}`) || field.split(".").pop() === key) {
      return true;
    }
  }

  return false;
}

/** Keep only the properties of an embedded page that Pega's view defines. */
function filterPageProperties(
  value: unknown,
  knownFields: Set<string>,
): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key, entry]) => fieldIsKnown(key, knownFields) && entry !== undefined,
    ),
  );
}

/**
 * Map the website's action payload onto Pega property names.
 *
 * Only known fields are forwarded; arbitrary browser input is never spread
 * into a case's clipboard.
 */
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/**
 * Digits-only, `+`-prefixed phone number for Pega's `ValidPhoneNumber`
 * validate — confirmed live to reject the spaced/grouped shape the phone
 * widget stores (e.g. `+91 89688 98973`).
 */
function pegaPhoneNumber(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) {
    return undefined;
  }

  const digits = digitsOnly(raw);
  return digits ? `+${digits}` : undefined;
}

/**
 * Pega's Nationality picklist on the Applicant page is a residency
 * classification (`Indian` / `Non-Resident Indian` / `Foreign National`),
 * not a country name — confirmed live. The intake field is free text, so a
 * customer or sample record naming the country ("India") is mapped onto the
 * closest valid classification; anything already matching passes through
 * unchanged, and an unrecognised value is left as-is rather than guessed.
 */
function pegaNationality(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) {
    return undefined;
  }

  const normalised = raw.trim().toLowerCase();

  if (normalised === "india" || normalised === "indian") {
    return "Indian";
  }

  if (normalised.includes("non-resident") || normalised === "nri") {
    return "Non-Resident Indian";
  }

  return raw;
}

/**
 * Compose a single-line address from the captured components.
 *
 * The verified Pega data model stores the address as one `AddressName` string
 * rather than structured components, so the parts are joined here.
 */
function composeAddress(data: Record<string, unknown>): string | undefined {
  const parts = [
    text(data.addressLine1),
    text(data.city),
    text(data.region),
    text(data.postalCode),
    text(data.country),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : undefined;
}

/**
 * Map everything the customer has provided onto Pega property names.
 *
 * Emits the embedded pages (`Applicant`, `Address`, `Document`, `Consent`) that
 * the flow actions actually expect — scalars are silently ignored by Pega for
 * page-typed fields. Only known fields are forwarded; arbitrary browser input
 * is never spread into a case's clipboard.
 */
function toPegaContent(
  data: Record<string, unknown> | undefined,
  context: { correlationId: string },
) {
  if (!data) {
    return {};
  }

  const content: Record<string, unknown> = {};
  const firstName = text(data.firstName) ?? "";
  const lastName = text(data.lastName) ?? "";
  const fullName = formatFullName({ firstName, lastName });
  const address = composeAddress(data) ?? text(data.selectedAddress);

  // Channel and session context identify the origin of every submission, and
  // Pega exposes them on more than the creation step, so they are always sent.
  content.Channel = String(data.channel ?? "WEB");
  content.SessionContext = context.correlationId;

  // Carried on every step because Pega asks for it again at product selection,
  // not only at case creation.
  const productIntent = text(data.productIntent) ?? text(data.productName);

  if (productIntent) {
    content.ProductIntent = productIntent;
  }

  // Employment details are declared as top-level case properties by the
  // employment step, and also offered on the Applicant page below. Each
  // submission is filtered to the properties its own action exposes, so
  // sending both means whichever shape Pega asks for is the one that arrives.
  //
  // Employment step declares these as top-level case properties.
  const alsoTopLevel: Array<[string, string | undefined]> = [
    ["EmploymentStatus", text(data.employmentStatus)],
    ["IncomeRange", text(data.incomeRange)],
    ["TaxResidency", text(data.taxResidency)],
  ];

  for (const [property, value] of alsoTopLevel) {
    if (value) {
      content[property] = value;
    }
  }

  if (fullName) {
    content.CustomerOnboardingName = fullName;
    // Property names come from the published data model for
    // ODHMNT-AgenticC-Data-Applicant. Names that only look right — `Email`
    // for `EmailAddress`, `Mobile` for `MobileNumber` — are dropped by the
    // field filter and the data silently never arrives.
    //
    // Nationality, MobileNumber and EmailAddress are nested here (not also
    // sent top-level) — CollectIdentityInformation's view was reconfigured
    // on the Pega side to accept them only as Applicant sub-properties.
    content.Applicant = {
      ApplicantName: fullName,
      FirstName: firstName || undefined,
      LastName: lastName || undefined,
      DateOfBirth: text(data.dateOfBirth),
      Nationality: pegaNationality(data.nationality),
      // Pega's ValidPhoneNumber validate rejects the "+91 89688 98973" shape
      // the phone widget stores (spaces, and the widget's own grouping) —
      // confirmed live. Digits-only with a leading "+" is what it accepts.
      MobileNumber: pegaPhoneNumber(data.mobile),
      EmailAddress: text(data.email),
      TaxResidency: text(data.taxResidency),
      IdentificationNumber: text(data.documentNumber),
    };
  }

  if (address) {
    // ODHMNT-AgenticC-Data-Address: the street line is `StreetAddress` and the
    // province is `State`, not `AddressLine1` and `Region`.
    content.Address = {
      AddressName: address,
      StreetAddress: text(data.addressLine1),
      City: text(data.city),
      State: text(data.region),
      PostalCode: text(data.postalCode),
      Country: text(data.country),
      AddressType: "Residential",
      // Set once the customer has explicitly confirmed a disputed address.
      CustomerConfirmationStatus:
        data.confirmed === true ? true : undefined,
    };
  }

  if (data.accepted === true) {
    // ODHMNT-AgenticC-Data-Consent. The status and channel are picklists, so
    // the values are the ones Pega defines — "Web", not the "WEB" used for
    // the case-level channel property.
    content.Consent = {
      ConsentName: String(data.textVersion ?? "northstar-consent"),
      ConsentType: "Data processing",
      ConsentTextVersion: text(data.textVersion),
      ConsentAcceptanceStatus: "Accepted",
      ConsentChannel: "Web",
      ConsentCaptureTimestamp: text(data.timestamp),
    };
  }

  // Pega's execution page list is its agentic audit trail. Carrying the
  // correlation ID here is what lets a Pega-side trace be tied back to a
  // specific request in this application's logs.
  content.Execution = [
    {
      ExecutionName: "Digital onboarding journey",
      AgentName: DIGITAL_CHANNEL_AGENT,
      CorrelationID: context.correlationId,
      ExecutionStatus: "Completed",
      ExecutionResult: "Success",
      ExecutionInitiator: "Customer",
      ExecutionTimestamp: new Date().toISOString(),
    },
  ];

  return content;
}

/**
 * The subset of `toPegaContent`'s output that `pyUpdateCaseDetails`'s own
 * view actually declares (confirmed live 2026-08-18 — see
 * `docs/pega-step-contract.md`'s sibling investigation). Unlike a flow
 * action's submission, this write is not filtered against a discovered
 * allowlist, so sending a field the view doesn't know about risks rejecting
 * the whole request rather than just that field — `toPegaContent` also
 * produces `EmploymentStatus`/`IncomeRange`/`TaxResidency` and its own
 * `Execution` row for flow-action submissions, none of which belong here.
 */
function pegaUpdateCaseDetailsContent(
  state: CaseIntegrationState,
): Record<string, unknown> {
  const content = toPegaContent(state.collected, {
    correlationId: state.correlationId,
  }) as {
    Applicant?: { ApplicantName?: string };
    Address?: { AddressName?: string };
    Consent?: { ConsentName?: string };
    Channel?: string;
    SessionContext?: string;
    ProductIntent?: string;
  };

  // `Applicant`/`Address`/`Consent` are single-reference fields on this
  // view (a Combobox bound to a savable Data object by pyGUID, not an
  // embedded page like `Document`/`CheckResult`/`Execution`) — confirmed
  // live 2026-08-19: this view accepts only the bare display-name property
  // for each. Sending `toPegaContent`'s fuller nested shape (StreetAddress,
  // FirstName, ConsentType, …) rejects the *entire* request with a generic
  // 400, silently dropping the document/execution rows in the same write.
  return Object.fromEntries(
    Object.entries({
      Applicant: content.Applicant?.ApplicantName
        ? { ApplicantName: content.Applicant.ApplicantName }
        : undefined,
      Address: content.Address?.AddressName
        ? { AddressName: content.Address.AddressName }
        : undefined,
      Consent: content.Consent?.ConsentName
        ? { ConsentName: content.Consent.ConsentName }
        : undefined,
      Channel: content.Channel,
      SessionContext: content.SessionContext,
      ProductIntent: content.ProductIntent,
    }).filter(([, value]) => value !== undefined),
  );
}

/** Test seam: clear tracked per-case integration state. */
export function resetPegaScenarioMemo(): void {
  void getPegaCaseStateStore().clear();
}
