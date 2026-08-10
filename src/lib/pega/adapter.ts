import { randomUUID } from "node:crypto";

import { z } from "zod";

import { requirePegaConfig } from "@/lib/config/env";
import { formatFullName } from "@/lib/onboarding/applicant-name";
import { getDocumentStorage } from "@/lib/storage/document-storage";
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
  dxAttachmentUploadSchema,
  dxCaseResponseSchema,
  dxCaseTypesResponseSchema,
} from "@/lib/pega/dx-schemas";
import { PegaIntegrationError } from "@/lib/pega/errors";
import { PegaHttpClient } from "@/lib/pega/http-client";
import {
  SAMPLE_DOCUMENT_FILE_NAMES,
  sampleDocumentPdf,
} from "@/lib/pega/sample-documents";

/**
 * Add a document to the recorded list, replacing any earlier one of the same
 * kind — re-uploading an identity document supersedes it rather than leaving
 * the customer looking at two.
 */
function recordUploadedDocument(
  existing: unknown,
  document: DocumentView,
): DocumentView[] {
  const current = Array.isArray(existing) ? (existing as DocumentView[]) : [];

  return [...current.filter((item) => item.kind !== document.kind), document];
}

/**
 * Find the property a flow action's attachment control writes to.
 *
 * Pega marks it in the view metadata as `@ATTACHMENT .SomeProperty`. Reading
 * it is necessary rather than tidy: the identity and address steps of the same
 * case type use different properties, so a hardcoded name works for one and is
 * rejected by the other.
 *
 * Returns the bare property name — Pega rejects the leading dot on submit even
 * though its own metadata includes it.
 */
export function attachmentFieldFrom(uiResources: unknown): string | undefined {
  const marker = /"@ATTACHMENT\s+\.?([A-Za-z0-9_]+)"/.exec(
    JSON.stringify(uiResources ?? {}),
  );

  return marker?.[1];
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
    /attachment content is empty|upload at least one attachment/i.test(
      error.technicalDetail ?? "",
    )
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
 * Load a case's integration state, seeding a default if none is stored.
 *
 * A missing entry is not an error: it happens after a deployment or when a
 * customer returns to a case this instance has not served before.
 */
async function loadState(caseId: string): Promise<CaseIntegrationState> {
  const existing = await getPegaCaseStateStore().get(caseId);

  if (existing) {
    return existing;
  }

  return {
    scenarioId: "ADDRESS_PEP_REVIEW",
    industryId: "banking",
    correlationId: `corr-${caseId}`,
    version: 1,
    collected: {},
  };
}

async function saveState(
  caseId: string,
  state: CaseIntegrationState,
): Promise<void> {
  await getPegaCaseStateStore().put(caseId, state);
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
          ProductIntent: request.productCode,
          Channel: request.channel,
          // Carries the trace identifier into Pega's own audit trail.
          SessionContext: correlationId,
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
      // Seeded so later steps that ask for the product again can answer.
      collected: { productIntent: request.productCode },
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
    // Read first: this refreshes the eTag Pega requires on write and lets a
    // stale browser submission be rejected before it reaches the case.
    const { caseInfo, state } = await this.readCase(caseId);

    // Concurrency is enforced by Pega's own eTag via `If-Match`, not by the
    // synthetic version. Pega advances a case through several flow actions per
    // customer step, so a locally counted version would go stale constantly and
    // reject valid submissions. A genuinely stale write still fails, because
    // Pega rejects the eTag and that surfaces as a 409.
    const assignment = primaryAssignment(caseInfo);

    if (!assignment) {
      throw new PegaIntegrationError("VALIDATION", {
        technicalDetail: `Case ${caseId} has no open assignment to act on.`,
        correlationId: state.correlationId,
      });
    }

    // The case is parked in Pega's error-recovery flow. Only an operator can
    // clear it, so the customer is shown the saved-application state rather
    // than a step that would fail again.
    if (awaitsProblemFlowResolution(caseInfo)) {
      return mapDxCaseToView(caseInfo, {
        scenarioId: state.scenarioId,
        industryId: state.industryId,
        caseVersion: state.version,
        correlationId: state.correlationId,
        collected: state.collected,
      });
    }

    // Handing over documents must work even while Pega runs an automated step
    // of its own: that is precisely when the customer is sitting on the upload
    // screen waiting. The attachment path finds its own step, or keeps the
    // evidence on the case until one opens.
    if (request.actionId === "USE_DEMO_DOCUMENTS") {
      state.collected = { ...state.collected, documentsProvided: true };
      await saveState(caseId, state);
      return this.attachSampleDocuments(caseId);
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
          content: restrictToAcceptedFields(
            conformToAllowedValues(content, view.fields, PICKLIST_FIELDS),
            view.acceptedFields,
            view.knownFields,
          ),
        },
      }));
    } catch (error) {
      // Pega wants a document at this step. Show the uploader rather than an
      // error: the customer has something to do, and nothing has gone wrong.
      if (isMissingAttachmentFailure(error)) {
        state.collected.awaitingDocumentUpload = true;
        await saveState(caseId, state);

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
            content: restrictToAcceptedFields(
              conformToAllowedValues(content, view.fields, PICKLIST_FIELDS),
              view.acceptedFields,
              view.knownFields,
            ),
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
    // Retrieve the bytes the upload route already stored, so the real file
    // reaches Pega rather than only its metadata.
    const stored = document.storageReference
      ? await getDocumentStorage().get(document.storageReference)
      : null;

    if (!stored) {
      throw new PegaIntegrationError("VALIDATION", {
        technicalDetail: `No stored content found for ${document.kind} document on case ${caseId}.`,
      });
    }

    const attachmentId = await this.uploadAttachment(caseId, {
      fileName: document.fileName,
      contentType: document.fileType,
      content: stored.content,
    });

    // The customer has now genuinely provided a document, which opens the
    // upload gate for the assignment waiting on one.
    const uploadState = await loadState(caseId);
    uploadState.collected.documentsProvided = true;
    // Pega's case content does not carry the file until later in its own
    // flow, so what the customer uploaded is recorded here — otherwise they
    // upload a document and the page shows nothing back.
    uploadState.collected.documents = recordUploadedDocument(
      uploadState.collected.documents,
      {
        documentId: attachmentId,
        kind: document.kind,
        fileName: document.fileName,
        fileType: document.fileType,
        fileSize: document.fileSize,
        status: "UPLOADED",
        source: document.source === "demo" ? "demo" : "upload",
        evidenceReference: attachmentId,
        storageReference: document.storageReference,
      },
    );
    await saveState(caseId, uploadState);

    // Advancing the open assignment is what moves the case on from "waiting
    // for a document"; the attachment alone does not.
    await this.advanceDocumentAssignment(caseId, document, {
      attachmentId,
      fileName: document.fileName,
    });

    return {
      documentId: attachmentId,
      fileName: document.fileName,
      status: "UPLOADED",
      evidenceReference: attachmentId,
    };
  }

  /**
   * Attach the bundled sample identity and address documents.
   *
   * Used by the presenter shortcut in place of live file selection; the files
   * are generated in-process and clearly marked as test data.
   */
  private async attachSampleDocuments(
    caseId: string,
  ): Promise<OnboardingCaseView> {
    const kinds: Array<UploadedDocument["kind"]> = ["IDENTITY", "ADDRESS"];

    for (const kind of kinds) {
      const content = sampleDocumentPdf(kind);
      const fileName = SAMPLE_DOCUMENT_FILE_NAMES[kind];

      const attachmentId = await this.uploadAttachment(caseId, {
        fileName,
        contentType: "application/pdf",
        content,
      });

      // Recorded for the same reason as a customer upload: so the page can
      // show what was attached before Pega's own content catches up.
      const sampleState = await loadState(caseId);
      sampleState.collected.documents = recordUploadedDocument(
        sampleState.collected.documents,
        {
          documentId: attachmentId,
          kind,
          fileName,
          fileType: "application/pdf",
          fileSize: content.byteLength,
          status: "UPLOADED",
          source: "demo",
          evidenceReference: attachmentId,
        },
      );
      await saveState(caseId, sampleState);

      await this.advanceDocumentAssignment(
        caseId,
        {
          kind,
          fileName,
          fileType: "application/pdf",
          fileSize: content.byteLength,
          source: "demo",
        },
        { attachmentId, fileName },
      );
    }

    return this.getCase(caseId);
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
   * Upload a file to Pega and link it directly to the case.
   *
   * Used when no flow action is waiting to receive the file; the document
   * steps attach through the action instead, so the case records which step
   * the evidence answered.
   */
  private async attachToCase(
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
            ID: uploaded.ID,
            name: file.fileName,
          },
        ],
      },
    });

    return uploaded.ID;
  }

  /**
   * Move the case past the assignment that was waiting for this document.
   *
   * Populates the `Document` page list where the flow action exposes it, so
   * the case data records what was provided, not just the raw attachment.
   */
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

      if (!needsAttachment || view.attachmentField) {
        return { assignment, flowActionId, view, state };
      }

      // This step takes no file. Answer it from what the customer already
      // gave and keep looking for the one that does.
      const content = toPegaContent(state.collected, {
        correlationId: state.correlationId,
      });

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
    }

    return undefined;
  }

  /**
   * Associate an already-uploaded file with the case.
   *
   * Used when no flow action is open to receive it: the evidence still belongs
   * to the case, and discarding it would mean asking the customer for the same
   * document again once Pega moves on.
   */
  private async linkAttachmentToCase(
    caseId: string,
    attachment: { attachmentId: string; fileName: string },
  ): Promise<void> {
    const state = await loadState(caseId);

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
            ID: attachment.attachmentId,
            name: attachment.fileName,
          },
        ],
      },
    });
  }

  private async advanceDocumentAssignment(
    caseId: string,
    document: UploadedDocument,
    attachment?: { attachmentId: string; fileName: string },
  ): Promise<void> {
    // Pega asks for the two documents at separate steps, with steps that want
    // no document in between. Walk forward to the one actually waiting for a
    // file rather than submitting wherever the case happens to be.
    const located = await this.locateAttachmentStep(caseId, Boolean(attachment));

    if (!located) {
      // Pega has no step open that can receive the file — its own automated
      // step is still running. Link the evidence to the case anyway, so the
      // customer's upload is not silently discarded while Pega catches up.
      if (attachment) {
        await this.linkAttachmentToCase(caseId, attachment);
      }

      return;
    }

    const { assignment, flowActionId, view, state } = located;

    const { data, eTag } = await this.client.requestWithMeta({
      method: "PATCH",
      path: `/assignments/${encodeURIComponent(assignment.ID)}/actions/${encodeURIComponent(flowActionId)}`,
      schema: dxCaseResponseSchema,
      correlationId: state.correlationId,
      eTag: view.eTag ?? state.eTag,
      body: {
        // The upload steps validate that a file reached the action itself, so
        // citing the attachment here is what satisfies them; an attachment
        // linked only to the case leaves the action reporting no content.
        ...(attachment && view.attachmentField
          ? {
              attachments: [
                {
                  type: "File",
                  category: "File",
                  ID: attachment.attachmentId,
                  name: attachment.fileName,
                  attachmentFieldName: view.attachmentField,
                },
              ],
            }
          : {}),
        content: restrictToAcceptedFields(
          {
            ...toPegaContent(state.collected, {
              correlationId: state.correlationId,
            }),
            Document: [
              {
                DocumentName: document.fileName,
                // Pega validates this against its own dropdown list, so the
                // value is chosen from what the view actually offers.
                DocumentType: pickDocumentType(
                  document.kind,
                  allowedValuesFor(view.fields, "DocumentType"),
                ),
                // Pega exposes a document number, but the journey does not ask
                // the customer for one. Sent only if a value is ever captured;
                // an invented number would be worse than an absent one.
                DocumentNumber: text(state.collected.documentNumber),
                // ODHMNT-AgenticC-Data-Document: the state after upload and
                // the handle Pega's extraction agent uses to fetch the bytes.
                DocumentStatus: "Uploaded",
                EvidenceReference: attachment?.attachmentId,
                UploadedByUser: document.source === "demo" ? "Demo" : "Customer",
              },
            ],
          },
          view.acceptedFields,
          view.knownFields,
        ),
      },
    });

    await saveState(caseId, recordObservation(state, data.data.caseInfo, eTag));
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
      // Which property this action's attachment control writes to, read from
      // the action rather than assumed: the identity step collects a list in
      // `UploadDocs` while the address step takes a single `AttachDoc`, and
      // citing the wrong one is rejected as invalid attachment details.
      attachmentField: attachmentFieldFrom(data.uiResources),
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
    };
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
      const rows = value
        .map((row) => filterPageProperties(row, knownFields))
        .filter((row) => Object.keys(row).length > 0);

      if (rows.length > 0) {
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
 * Choose a document type Pega will accept for the given evidence kind.
 *
 * Preferences are tried in order against the list Pega actually offers, so a
 * change to that list cannot break the journey; `Other` is the safety net, and
 * `undefined` means the field is omitted entirely.
 */
function pickDocumentType(
  kind: UploadedDocument["kind"],
  allowed: string[],
): string | undefined {
  if (allowed.length === 0) {
    return undefined;
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
      ([key, entry]) => knownFields.has(key) && entry !== undefined,
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
  const employment: Array<[string, string | undefined]> = [
    ["EmploymentStatus", text(data.employmentStatus)],
    ["IncomeRange", text(data.incomeRange)],
    ["TaxResidency", text(data.taxResidency)],
  ];

  for (const [property, value] of employment) {
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
    content.Applicant = {
      ApplicantName: fullName,
      DateOfBirth: text(data.dateOfBirth),
      Nationality: text(data.nationality),
      MobileNumber: text(data.mobile),
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

/** Test seam: clear tracked per-case integration state. */
export function resetPegaScenarioMemo(): void {
  void getPegaCaseStateStore().clear();
}
