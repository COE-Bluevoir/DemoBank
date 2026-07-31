import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  advanceCase,
  clearReview,
  createCaseRecord,
  fetchCaseView,
  getDemoSettings,
  resetCase,
  saveDocument,
  submitCaseAction,
  updateMode,
} from "@/lib/onboarding/engine";
import { getAdapter } from "@/lib/onboarding/adapters";
import { DEMO_CUSTOMER } from "@/lib/onboarding/constants";
import { isDemoAuthorizedCookie } from "@/lib/onboarding/demo-auth";

const STORE_DIR = path.join(process.cwd(), ".demo-data");

function clearStore() {
  fs.rmSync(STORE_DIR, { recursive: true, force: true });
}

describe("onboarding engine", () => {
  beforeEach(() => {
    clearStore();
  });

  afterEach(() => {
    clearStore();
  });

  it("creates a deterministic case and progresses through address review", () => {
    const created = createCaseRecord(
      {
        productCode: "EVERYDAY_PLUS",
        channel: "WEB",
        scenarioId: "ADDRESS_PEP_REVIEW",
      },
      "mock-pega",
    );

    expect(created.caseId).toMatch(/^ONB-/);

    let caseView = submitCaseAction(created.caseId, {
      actionId: "BEGIN_APPLICATION",
      expectedCaseVersion: 1,
    });

    caseView = submitCaseAction(created.caseId, {
      actionId: "SUBMIT_DETAILS",
      expectedCaseVersion: caseView.caseVersion,
      data: DEMO_CUSTOMER,
    });

    caseView = submitCaseAction(created.caseId, {
      actionId: "ACCEPT_CONSENT",
      expectedCaseVersion: caseView.caseVersion,
      data: {
        accepted: true,
        timestamp: new Date().toISOString(),
        textVersion: "northstar-consent-v1",
        channel: "WEB",
      },
    });

    caseView = submitCaseAction(created.caseId, {
      actionId: "USE_DEMO_DOCUMENTS",
      expectedCaseVersion: caseView.caseVersion,
    });

    expect(caseView.status).toBe("VERIFYING_DOCUMENTS");

    caseView = advanceCase(created.caseId);
    expect(caseView.status).toBe("ADDRESS_CONFIRMATION_REQUIRED");

    caseView = submitCaseAction(created.caseId, {
      actionId: "CONFIRM_ADDRESS",
      expectedCaseVersion: caseView.caseVersion,
      data: {
        selectedAddress: "81 Lake View Road",
        confirmed: true,
      },
    });

    expect(caseView.status).toBe("SCREENING_IN_PROGRESS");

    caseView = advanceCase(created.caseId);
    expect(caseView.status).toBe("ROUTINE_REVIEW");

    caseView = clearReview(created.caseId);
    caseView = advanceCase(created.caseId);
    expect(caseView.status).toBe("COMPLETED");
    expect(caseView.outcome?.customerReference).toBe("CUST-100482");
  });

  it("stores uploaded document metadata and resets a case", () => {
    const created = createCaseRecord(
      {
        productCode: "EVERYDAY_PLUS",
        channel: "WEB",
        scenarioId: "HAPPY_PATH",
      },
      "mock-pega",
    );

    let caseView = submitCaseAction(created.caseId, {
      actionId: "BEGIN_APPLICATION",
      expectedCaseVersion: 1,
    });
    caseView = submitCaseAction(created.caseId, {
      actionId: "SUBMIT_DETAILS",
      expectedCaseVersion: caseView.caseVersion,
      data: DEMO_CUSTOMER,
    });
    caseView = submitCaseAction(created.caseId, {
      actionId: "ACCEPT_CONSENT",
      expectedCaseVersion: caseView.caseVersion,
      data: {
        accepted: true,
        timestamp: new Date().toISOString(),
        textVersion: "northstar-consent-v1",
        channel: "WEB",
      },
    });

    saveDocument(created.caseId, {
      kind: "IDENTITY",
      fileName: "identity.pdf",
      fileType: "application/pdf",
      fileSize: 1024,
      source: "upload",
    });

    caseView = fetchCaseView(created.caseId);
    expect(caseView.documents?.length).toBe(1);

    const resetView = resetCase(created.caseId);
    expect(resetView.status).toBe("STARTED");
    expect(resetView.documents).toHaveLength(0);
  });

  it("updates mode settings and selects adapters", () => {
    updateMode("non-pega");
    expect(getDemoSettings().orchestrationMode).toBe("non-pega");
    expect(getAdapter("pega")).toBeDefined();
  });

  it("validates demo-control cookies", () => {
    const cookieStore = {
      get() {
        return { value: "northstar-26" };
      },
    };

    expect(isDemoAuthorizedCookie(cookieStore)).toBe(true);
  });
});
