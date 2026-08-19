// @vitest-environment node
import { describe, expect, it } from "vitest";

import { mapDxCaseToView, mapDxStatus } from "@/lib/pega/dx-mapper";
import { dxCaseResponseSchema, type DxCaseInfo } from "@/lib/pega/dx-schemas";

/**
 * Fixtures mirror the real payloads captured from the `AgenticC` /
 * `Customer Onboarding (Unified)` case type.
 */

const REAL_STAGES = [
  { ID: "PRIM0", name: "Initiate", type: "Primary", visited_status: "active" },
  { ID: "PRIM1", name: "Capture Details", type: "Primary", visited_status: "future" },
  { ID: "PRIM2", name: "Verify Identity", type: "Primary", visited_status: "future" },
  { ID: "PRIM3", name: "Perform Screening", type: "Primary", visited_status: "future" },
  { ID: "PRIM4", name: "Resolve Exceptions", type: "Primary", visited_status: "future" },
  { ID: "PRIM5", name: "Create Customer", type: "Primary", visited_status: "future" },
  { ID: "PRIM6", name: "Complete", type: "Primary", visited_status: "future" },
  { ID: "ALT2", name: "Pending Review", type: "Alternate", visited_status: "future" },
  { ID: "ALT3", name: "Declined", type: "Alternate", visited_status: "future" },
];

function caseInfo(overrides: Partial<DxCaseInfo> = {}): DxCaseInfo {
  return {
    ID: "ODHMNT-AGENTICC-WORK C-192016",
    businessID: "C-192016",
    caseTypeID: "ODHMNT-AgenticC-Work-CustomerOnboardingUnified",
    caseTypeName: "Customer Onboarding (Unified)",
    status: "New",
    stageID: "PRIM0",
    stageLabel: "Initiate",
    lastUpdateTime: "2026-08-03T06:13:56.855Z",
    stages: REAL_STAGES,
    ...overrides,
  };
}

const context = {
  scenarioId: "ADDRESS_PEP_REVIEW" as const,
  industryId: "banking" as const,
  caseVersion: 3,
  correlationId: "corr-abc",
};

describe("DX v2 payload validation", () => {
  it("accepts the real create-case envelope", () => {
    const parsed = dxCaseResponseSchema.safeParse({
      data: { caseInfo: caseInfo() },
      ID: "ODHMNT-AGENTICC-WORK C-192016",
      nextAssignmentInfo: {
        ID: "ASSIGN-WORKLIST ODHMNT-AGENTICC-WORK C-192016!INITIATE_FLOW",
        context: "self",
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("tolerates unknown properties so Pega can evolve its payload", () => {
    const parsed = dxCaseResponseSchema.safeParse({
      data: { caseInfo: { ...caseInfo(), someNewPegaField: { nested: true } } },
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects a payload missing the case envelope", () => {
    expect(dxCaseResponseSchema.safeParse({ data: {} }).success).toBe(false);
  });
});

describe("DX v2 stage mapping", () => {
  it("maps every real stage onto a normalized status", () => {
    const expectations: Array<[string, string, string]> = [
      ["PRIM0", "Initiate", "STARTED"],
      ["PRIM1", "Capture Details", "INFORMATION_REQUIRED"],
      ["PRIM2", "Verify Identity", "VERIFYING_DOCUMENTS"],
      ["PRIM3", "Perform Screening", "SCREENING_IN_PROGRESS"],
      ["PRIM4", "Resolve Exceptions", "ROUTINE_REVIEW"],
      ["PRIM5", "Create Customer", "CREATING_CUSTOMER"],
      ["PRIM6", "Complete", "COMPLETED"],
      ["ALT1", "Pending Information", "INFORMATION_REQUIRED"],
      ["ALT2", "Pending Review", "ROUTINE_REVIEW"],
      ["ALT3", "Declined", "UNABLE_TO_CONTINUE"],
      ["ALT4", "Withdrawn", "UNABLE_TO_CONTINUE"],
      ["ALT5", "Approval Rejection", "UNABLE_TO_CONTINUE"],
    ];

    for (const [stageID, stageLabel, expected] of expectations) {
      expect(mapDxStatus(caseInfo({ stageID, stageLabel }))).toBe(expected);
    }
  });

  it("stays on documents after consent while Pega is still on Capture Details", () => {
    const info = caseInfo({
      stageID: "PRIM1",
      stageLabel: "Capture Details",
      assignments: [
        {
          ID: "ASSIGN-WORKBASKET X!CAPTUREDETAILS_FLOW",
          name: "Collect Address",
          actions: [{ ID: "CollectAddress", name: "Collect Address" }],
        },
      ],
    });

    expect(
      mapDxStatus(info, {
        accepted: true,
        documents: [{ fileName: "id.png" }],
        awaitingDocumentUpload: true,
        documentsProvided: false,
      }),
    ).toBe("DOCUMENTS_REQUIRED");
  });

  it("flags an address discrepancy scripted mode has mirrored, even mid-verification", () => {
    const info = caseInfo({ stageID: "PRIM2", stageLabel: "Verify Identity" });

    expect(
      mapDxStatus(info, { addressMismatchPending: true, addressConfirmed: false }),
    ).toBe("ADDRESS_CONFIRMATION_REQUIRED");
  });

  it("stops flagging the address discrepancy once the customer has confirmed it", () => {
    const info = caseInfo({ stageID: "PRIM2", stageLabel: "Verify Identity" });

    expect(
      mapDxStatus(info, { addressMismatchPending: true, addressConfirmed: true }),
    ).toBe("VERIFYING_DOCUMENTS");
  });

  it("shows screening in progress while scripted mode's screening mirror is pending", () => {
    const info = caseInfo({ stageID: "PRIM2", stageLabel: "Verify Identity" });

    expect(mapDxStatus(info, { screeningPending: true })).toBe(
      "SCREENING_IN_PROGRESS",
    );
  });

  it("routes into unable-to-continue on a live problem-flow assignment", () => {
    const info = caseInfo({
      stageID: "PRIM2",
      stageLabel: "Verify Identity",
      assignments: [
        {
          ID: "ASSIGN-WORKBASKET X!FLOWPROBLEMS",
          name: "Problem Flow Assignment",
          processID: "FlowProblems",
        },
      ],
    });

    expect(mapDxStatus(info)).toBe("UNABLE_TO_CONTINUE");
  });

  it("ignores a stale problem-flow assignment once scripted mode owns the case", () => {
    const info = caseInfo({
      stageID: "PRIM6",
      stageLabel: "Complete",
      assignments: [
        {
          ID: "ASSIGN-WORKBASKET X!FLOWPROBLEMS",
          name: "Problem Flow Assignment",
          processID: "FlowProblems",
        },
      ],
    });

    expect(mapDxStatus(info, { scriptedDriveActive: true })).toBe("COMPLETED");
  });

  it("treats a resolved-completed case as complete whatever the stage says", () => {
    expect(
      mapDxStatus(
        caseInfo({ status: "Resolved-Completed", stageLabel: "Perform Screening" }),
      ),
    ).toBe("COMPLETED");
  });

  it("treats other resolved statuses as unable to continue", () => {
    expect(mapDxStatus(caseInfo({ status: "Resolved-Withdrawn" }))).toBe(
      "UNABLE_TO_CONTINUE",
    );
    expect(mapDxStatus(caseInfo({ status: "Resolved-Rejected" }))).toBe(
      "UNABLE_TO_CONTINUE",
    );
  });

  it("falls back to the stage ID when the label is unrecognised", () => {
    expect(
      mapDxStatus(caseInfo({ stageID: "PRIM3", stageLabel: "Renamed By Designer" })),
    ).toBe("SCREENING_IN_PROGRESS");
  });

  it("falls back to the active stage when no label is present", () => {
    const info = caseInfo({ stageLabel: undefined, stageID: undefined });
    info.stages = REAL_STAGES.map((stage) => ({
      ...stage,
      visited_status: stage.ID === "PRIM4" ? "active" : "future",
    }));

    expect(mapDxStatus(info)).toBe("ROUTINE_REVIEW");
  });

  it("is insensitive to stage label casing and spacing", () => {
    expect(mapDxStatus(caseInfo({ stageLabel: "  PERFORM   SCREENING " }))).toBe(
      "SCREENING_IN_PROGRESS",
    );
  });
});

describe("DX v2 case view mapping", () => {
  it("produces a customer-safe status and preserves tracked identifiers", () => {
    const view = mapDxCaseToView(
      caseInfo({ stageID: "PRIM4", stageLabel: "Resolve Exceptions" }),
      context,
    );

    expect(view.status).toBe("ROUTINE_REVIEW");
    expect(view.customerSafeStatus).toBe("Routine review");
    expect(view.orchestrationMode).toBe("pega");
    expect(view.caseVersion).toBe(3);
    expect(view.correlationId).toBe("corr-abc");
  });

  it("never exposes Pega internals in customer-facing fields", () => {
    const view = mapDxCaseToView(
      caseInfo({
        stageID: "PRIM4",
        stageLabel: "Resolve Exceptions",
        assignments: [
          {
            ID: "ASSIGN-WORKLIST ODHMNT-AGENTICC-WORK C-192016!PEP_REVIEW_FLOW",
            name: "PEP potential match review",
            actions: [{ ID: "ReviewPepMatch", name: "Review PEP match" }],
          },
        ],
      }),
      context,
    );

    const customerFacing = JSON.stringify({
      status: view.customerSafeStatus,
      detail: view.statusDetail,
      action: view.currentAction?.label,
      messages: view.assistantMessages,
    });

    expect(customerFacing).not.toMatch(/PEP|ASSIGN-WORKLIST|ODHMNT|sanction/i);
    expect(view.currentAction?.label).toBe("Check status");
  });

  it("carries the Pega flow action ID so the adapter can submit it back", () => {
    const view = mapDxCaseToView(
      caseInfo({
        assignments: [
          {
            ID: "ASSIGN-WORKLIST X!INITIATE_FLOW",
            actions: [{ ID: "CreateCaseRecord", name: "Create Case Record" }],
          },
        ],
      }),
      context,
    );

    expect(view.currentAction?.id).toBe("CreateCaseRecord");
  });

  it("offers no action while the case is processing", () => {
    const view = mapDxCaseToView(
      caseInfo({ stageID: "PRIM3", stageLabel: "Perform Screening" }),
      context,
    );

    expect(view.currentAction).toBeUndefined();
  });

  it("withholds the applicant until Pega actually holds a name", () => {
    const empty = mapDxCaseToView(
      caseInfo({
        content: {
          Applicant: { classID: "ODHMNT-AgenticC-Data-Applicant", ApplicantName: "" },
          Address: { classID: "ODHMNT-AgenticC-Data-Address", AddressName: "" },
          CustomerOnboardingName: "",
        },
      }),
      context,
    );

    expect(empty.applicant).toBeUndefined();
  });

  it("maps applicant and address content once Pega holds it", () => {
    const view = mapDxCaseToView(
      caseInfo({
        content: {
          Applicant: { ApplicantName: "Ananya Rao", Email: "a@example.test" },
          Address: { AddressLine1: "18 Lake View Road", City: "Hyderabad" },
        },
      }),
      context,
    );

    expect(view.applicant?.firstName).toBe("Ananya");
    expect(view.applicant?.lastName).toBe("Rao");
    expect(view.applicant?.email).toBe("a@example.test");
    expect(view.applicant?.addressLine1).toBe("18 Lake View Road");
    expect(view.applicant?.city).toBe("Hyderabad");
  });

  it("exposes the outcome only when both references exist", () => {
    expect(
      mapDxCaseToView(caseInfo({ content: { CustomerID: "CUST-1" } }), context)
        .outcome,
    ).toBeUndefined();

    const complete = mapDxCaseToView(
      caseInfo({
        status: "Resolved-Completed",
        content: { CustomerID: "CUST-1", AccountID: "ACC-9" },
      }),
      context,
    );

    expect(complete.outcome).toEqual({
      customerReference: "CUST-1",
      accountReference: "ACC-9",
      productName: "Everyday Plus Account",
    });
  });

  it("synthesizes reference numbers for a scripted-mode case Pega never ran Create Customer on", () => {
    const complete = mapDxCaseToView(
      caseInfo({ status: "Resolved-Completed", businessID: "C-208063" }),
      { ...context, collected: { scriptedDriveActive: true } },
    );

    expect(complete.outcome).toEqual({
      customerReference: "CUS-208063",
      accountReference: "EPA-208063",
      productName: "Everyday Plus Account",
    });
  });

  it("does not synthesize reference numbers outside scripted mode", () => {
    const complete = mapDxCaseToView(
      caseInfo({ status: "Resolved-Completed", businessID: "C-208063" }),
      context,
    );

    expect(complete.outcome).toBeUndefined();
  });

  it("prefers Pega's own reference numbers over synthesized ones when both exist", () => {
    const complete = mapDxCaseToView(
      caseInfo({
        status: "Resolved-Completed",
        businessID: "C-208063",
        content: { CustomerID: "CUST-1", AccountID: "ACC-9" },
      }),
      { ...context, collected: { scriptedDriveActive: true } },
    );

    expect(complete.outcome).toEqual({
      customerReference: "CUST-1",
      accountReference: "ACC-9",
      productName: "Everyday Plus Account",
    });
  });

  it("shows the customer Pega's business ID, not its work-class ID", () => {
    // Pega's case ID embeds the internal work class. Showing it to a customer
    // is both meaningless to them and a disclosure of the implementation.
    const view = mapDxCaseToView(caseInfo(), context);

    expect(view.caseId).toBe("ODHMNT-AGENTICC-WORK C-192016");
    expect(view.displayReference).toBe("C-192016");
    expect(view.displayReference).not.toMatch(/ODHMNT/);
  });

  it("falls back to the case ID when Pega supplies no business ID", () => {
    const view = mapDxCaseToView(
      caseInfo({ businessID: undefined }),
      context,
    );

    expect(view.displayReference).toBe("ODHMNT-AGENTICC-WORK C-192016");
  });

  it("surfaces documents from Pega's own Document page list", () => {
    const view = mapDxCaseToView(
      caseInfo({
        content: {
          Document: [{ DocumentName: "Proof.pdf", DocumentType: "Passport" }],
        },
      }),
      context,
    );

    expect(view.documents?.[0]?.fileName).toBe("Proof.pdf");
  });

  it("shows an upload before Pega's content catches up", () => {
    // Pega records the file in its case content later in its own flow. Until
    // then the customer would see no acknowledgement of what they uploaded.
    const view = mapDxCaseToView(caseInfo(), {
      ...context,
      collected: {
        documents: [
          {
            documentId: "att-1",
            kind: "ADDRESS",
            fileName: "Utility_Bill.pdf",
            fileType: "application/pdf",
            fileSize: 1024,
            status: "UPLOADED",
            source: "upload",
            evidenceReference: "att-1",
          },
        ],
      },
    });

    expect(view.documents).toHaveLength(1);
    expect(view.documents?.[0]?.kind).toBe("ADDRESS");
  });

  it("marks progress as complete when the case resolves", () => {
    const view = mapDxCaseToView(caseInfo({ status: "Resolved-Completed" }), context);

    expect(view.progress.steps.every((step) => step.state === "completed")).toBe(
      true,
    );
  });
});
