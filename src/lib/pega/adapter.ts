import { randomUUID } from "node:crypto";

import { z } from "zod";

import { requirePegaConfig } from "@/lib/config/env";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import type {
  AssistantMessage,
  CreateOnboardingCaseRequest,
  CreateOnboardingCaseResponse,
  DemoExecutionEvent,
  DocumentUploadResponse,
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
      correlationId,
      version: 1,
      eTag,
      lastUpdateTime: caseInfo.lastUpdateTime,
      collected: {},
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
    const content = toPegaContent(state.collected);

    // The sample-document path must produce real attachments in Pega, not a
    // metadata-only shortcut, so the demo exercises the same route as a
    // genuine customer upload.
    if (request.actionId === "USE_DEMO_DOCUMENTS") {
      state.collected.documentsProvided = true;
      await saveState(caseId, state);
      return this.attachSampleDocuments(caseId);
    }

    // Pega may be waiting on a step the customer has not yet reached in the
    // website's own order. Record what they gave and stop, rather than
    // answering Pega on their behalf.
    const gateLabel = `${assignment.name ?? ""} ${flowActionId}`;

    if (isGated(gateLabel, state.collected)) {
      return mapDxCaseToView(caseInfo, {
        scenarioId: state.scenarioId,
        caseVersion: state.version,
        correlationId: state.correlationId,
        collected: state.collected,
      });
    }

    const { data, eTag } = await this.client.requestWithMeta({
      method: "PATCH",
      path: `/assignments/${encodeURIComponent(assignment.ID)}/actions/${encodeURIComponent(flowActionId)}`,
      schema: dxCaseResponseSchema,
      correlationId: state.correlationId,
      // The action's own eTag is the one Pega validates on write.
      eTag: view.eTag ?? state.eTag,
      idempotencyKey: `${caseId}:${request.actionId}:${request.expectedCaseVersion}`,
      body: {
        content: restrictToAcceptedFields(
          content,
          view.acceptedFields,
          view.knownFields,
        ),
      },
    });

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

      const { data, eTag } = await this.client.requestWithMeta({
        method: "PATCH",
        path: `/assignments/${encodeURIComponent(assignment.ID)}/actions/${encodeURIComponent(nextActionId)}`,
        schema: dxCaseResponseSchema,
        correlationId: state.correlationId,
        eTag: view.eTag ?? state.eTag,
        body: {
        content: restrictToAcceptedFields(
          content,
          view.acceptedFields,
          view.knownFields,
        ),
      },
      });

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

    const attachmentId = await this.attachToCase(caseId, {
      fileName: document.fileName,
      contentType: document.fileType,
      content: stored.content,
    });

    // The customer has now genuinely provided a document, which opens the
    // upload gate for the assignment waiting on one.
    const uploadState = await loadState(caseId);
    uploadState.collected.documentsProvided = true;
    await saveState(caseId, uploadState);

    // Advancing the open assignment is what moves the case on from "waiting
    // for a document"; the attachment alone does not.
    await this.advanceDocumentAssignment(caseId, document);

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
    const samples: Array<{ kind: UploadedDocument["kind"]; fileName: string }> = [
      { kind: "IDENTITY", fileName: "Sample_Identity_Document.pdf" },
      { kind: "ADDRESS", fileName: "Sample_Proof_Of_Address.pdf" },
    ];

    for (const sample of samples) {
      await this.attachToCase(caseId, {
        fileName: sample.fileName,
        contentType: "application/pdf",
        content: samplePdf(sample.fileName),
      });

      await this.advanceDocumentAssignment(caseId, {
        kind: sample.kind,
        fileName: sample.fileName,
        fileType: "application/pdf",
        fileSize: samplePdf(sample.fileName).byteLength,
        source: "demo",
      });
    }

    return this.getCase(caseId);
  }

  /**
   * Upload a file to Pega and link it to the case.
   *
   * Two calls, because Pega separates storing the bytes from associating them
   * with a case. Returns the case-scoped attachment link ID.
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
  private async advanceDocumentAssignment(
    caseId: string,
    document: UploadedDocument,
  ): Promise<void> {
    const { caseInfo, state } = await this.readCase(caseId);
    const assignment = primaryAssignment(caseInfo);
    const flowActionId = assignment?.actions?.[0]?.ID;

    if (!assignment || !flowActionId) {
      return;
    }

    const view = await this.readAssignmentAction(assignment.ID, flowActionId);

    const { data, eTag } = await this.client.requestWithMeta({
      method: "PATCH",
      path: `/assignments/${encodeURIComponent(assignment.ID)}/actions/${encodeURIComponent(flowActionId)}`,
      schema: dxCaseResponseSchema,
      correlationId: state.correlationId,
      eTag: view.eTag ?? state.eTag,
      body: {
        content: restrictToAcceptedFields(
          {
            ...toPegaContent(state.collected),
            Document: [
              {
                DocumentName: document.fileName,
                // Pega validates this against its own dropdown list, so the
                // value is chosen from what the view actually offers.
                DocumentType: pickDocumentType(
                  document.kind,
                  allowedValuesFor(view.fields, "DocumentType"),
                ),
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
      path: `/assignments/${encodeURIComponent(assignmentId)}/actions/${encodeURIComponent(actionId)}`,
      schema: dxCaseResponseSchema,
    });

    const notReserved = (key: string) =>
      !PEGA_RESERVED_PREFIXES.some((prefix) => key.startsWith(prefix));

    return {
      eTag,
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
 * Build a minimal, valid PDF for the sample-document path.
 *
 * Generated rather than shipped as a binary so the bytes are inspectable and
 * the file is unmistakably test data.
 */
function samplePdf(title: string): Uint8Array {
  const body = [
    "%PDF-1.7",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj",
    `% ${title} - fictional sample document for demonstration only`,
    "trailer<</Root 1 0 R>>",
    "%%EOF",
  ].join("\n");

  return new TextEncoder().encode(body);
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
function toPegaContent(data: Record<string, unknown> | undefined) {
  if (!data) {
    return {};
  }

  const content: Record<string, unknown> = {};
  const fullName = text(data.fullName);
  const address = composeAddress(data) ?? text(data.selectedAddress);

  if (fullName) {
    content.CustomerOnboardingName = fullName;
    content.Applicant = {
      // `ApplicantName` is the only property the verified case type defines
      // today. The rest are offered so that if the Pega team adds them to the
      // Applicant page, they populate with no website change.
      ApplicantName: fullName,
      DateOfBirth: text(data.dateOfBirth),
      Nationality: text(data.nationality),
      Mobile: text(data.mobile),
      Email: text(data.email),
      EmploymentStatus: text(data.employmentStatus),
      IncomeRange: text(data.incomeRange),
      TaxResidency: text(data.taxResidency),
    };
  }

  if (address) {
    content.Address = {
      AddressName: address,
      AddressLine1: text(data.addressLine1),
      City: text(data.city),
      Region: text(data.region),
      PostalCode: text(data.postalCode),
      Country: text(data.country),
    };
  }

  if (text(data.productName)) {
    content.ProductIntent = text(data.productName);
  }

  if (data.accepted === true) {
    content.Consent = {
      // The verified case type defines `ConsentName` only.
      ConsentName: String(data.textVersion ?? "northstar-consent"),
      ConsentAccepted: true,
      ConsentVersion: text(data.textVersion),
      ConsentTimestamp: text(data.timestamp),
    };
    content.Channel = String(data.channel ?? "WEB");
  }

  const documentName = text(data.documentName);

  if (documentName) {
    content.Document = [
      {
        DocumentName: documentName,
        DocumentType: text(data.documentType) ?? "",
        DocumentNumber: text(data.documentNumber) ?? "",
      },
    ];
  }

  return content;
}

/** Test seam: clear tracked per-case integration state. */
export function resetPegaScenarioMemo(): void {
  void getPegaCaseStateStore().clear();
}
