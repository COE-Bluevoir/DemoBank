import { z } from "zod";

/**
 * Pega DX API v2 response shapes.
 *
 * These describe what a Constellation-compatible Pega application actually
 * returns, verified against the `AgenticC` / `Customer Onboarding (Unified)`
 * case type. Schemas are deliberately lenient: Pega returns a large, evolving
 * payload and this website reads only the fields it needs, so unknown
 * properties are ignored rather than rejected.
 */

export const dxLinkSchema = z
  .object({
    rel: z.string().optional(),
    href: z.string().optional(),
    type: z.string().optional(),
    title: z.string().optional(),
  })
  .loose();

export const dxActionSchema = z
  .object({
    ID: z.string(),
    name: z.string().optional(),
    type: z.string().optional(),
  })
  .loose();

export const dxAssignmentSchema = z
  .object({
    ID: z.string(),
    name: z.string().optional(),
    processID: z.string().optional(),
    processName: z.string().optional(),
    instructions: z.string().optional(),
    canPerform: z.union([z.string(), z.boolean()]).optional(),
    urgency: z.number().optional(),
    actions: z.array(dxActionSchema).optional(),
  })
  .loose();

export const dxStageSchema = z
  .object({
    ID: z.string(),
    name: z.string(),
    type: z.string().optional(),
    /** `active` | `future` | `completed` */
    visited_status: z.string().optional(),
    entryTime: z.string().optional(),
    transitionType: z.string().optional(),
  })
  .loose();

/**
 * Case content is the application's own data model. It is entirely
 * Pega-defined, so it is accepted as an open record and read defensively.
 */
export const dxContentSchema = z.record(z.string(), z.unknown());

export const dxCaseInfoSchema = z
  .object({
    ID: z.string(),
    businessID: z.string().optional(),
    caseTypeID: z.string().optional(),
    caseTypeName: z.string().optional(),
    name: z.string().optional(),
    status: z.string().optional(),
    stageID: z.string().optional(),
    stageLabel: z.string().optional(),
    createTime: z.string().optional(),
    lastUpdateTime: z.string().optional(),
    stages: z.array(dxStageSchema).optional(),
    assignments: z.array(dxAssignmentSchema).optional(),
    availableActions: z.array(dxActionSchema).optional(),
    content: dxContentSchema.optional(),
  })
  .loose();

export type DxCaseInfo = z.infer<typeof dxCaseInfoSchema>;

/** Envelope returned by GET/POST/PATCH on cases and assignment actions. */
/**
 * Form metadata for a flow action.
 *
 * `resources.fields` is a flat map of every property the view exposes,
 * including properties nested inside embedded pages. It is the authoritative
 * allowlist for what a submission may contain.
 */
export const dxUiResourcesSchema = z
  .object({
    resources: z
      .object({
        fields: z.record(z.string(), z.unknown()).optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

export const dxCaseResponseSchema = z
  .object({
    data: z
      .object({
        caseInfo: dxCaseInfoSchema,
      })
      .loose(),
    uiResources: dxUiResourcesSchema.optional(),
    ID: z.string().optional(),
    nextAssignmentInfo: z
      .object({
        ID: z.string(),
        context: z.string().optional(),
        className: z.string().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

export type DxCaseResponse = z.infer<typeof dxCaseResponseSchema>;

export const dxCaseTypesResponseSchema = z
  .object({
    applicationIsConstellationCompatible: z.boolean().optional(),
    caseTypes: z
      .array(
        z
          .object({
            ID: z.string(),
            name: z.string().optional(),
          })
          .loose(),
      )
      .optional(),
  })
  .loose();

/** Pega's structured error body, used for server-side diagnostics only. */
export const dxErrorSchema = z
  .object({
    errorClassification: z.string().optional(),
    localizedValue: z.string().optional(),
    errorDetails: z
      .array(
        z
          .object({
            message: z.string().optional(),
            localizedValue: z.string().optional(),
          })
          .loose(),
      )
      .optional(),
  })
  .loose();

export const dxAttachmentUploadSchema = z.preprocess((value) => {
  if (Array.isArray(value) && value[0] && typeof value[0] === "object") {
    return value[0];
  }

  if (value && typeof value === "object" && "attachments" in value) {
    const attachments = (value as { attachments?: unknown }).attachments;
    if (Array.isArray(attachments) && attachments[0]) {
      return attachments[0];
    }
  }

  return value;
}, z
  .object({
    ID: z.string().optional(),
    id: z.string().optional(),
    pzInsKey: z.string().optional(),
  })
  .loose()
  .transform((value) => {
    const ID = value.ID ?? value.id ?? value.pzInsKey;
    if (!ID) {
      throw new Error("Attachment upload did not return an ID.");
    }
    return { ID };
  }));

export const dxAttachmentListSchema = z
  .object({
    attachments: z
      .array(
        z
          .object({
            ID: z.string(),
            name: z.string().optional(),
            category: z.string().optional(),
kind: z.string().optional(),
          })
          .loose(),
      )
      .optional(),
  })
  .loose();
