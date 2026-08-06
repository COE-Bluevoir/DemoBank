// @vitest-environment node
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
  serializeError,
  submitCaseAction,
  updateMode,
} from "@/lib/onboarding/engine";
import {
  ConfigurationError,
  loadServerConfigFrom,
  requirePegaConfigFrom,
} from "@/lib/config/env";
import { PegaIntegrationError, type PegaFailureKind } from "@/lib/pega/errors";
import { applicantSchema } from "@/lib/onboarding/schemas";
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
        industryId: "banking",
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
      data: { ...DEMO_CUSTOMER },
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
        industryId: "banking",
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
      data: { ...DEMO_CUSTOMER },
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
    expect(getAdapter("non-pega")).toBeDefined();
    expect(getAdapter("mock-pega")).toBeDefined();
  });

  it("refuses to build a Pega adapter when the connection is unconfigured", () => {
    // Asserted against an explicitly empty configuration: a build environment
    // with real Pega credentials would otherwise make this pass vacuously.
    const unconfigured = loadServerConfigFrom({ ORCHESTRATION_MODE: "mock-pega" });

    expect(unconfigured.pega).toBeUndefined();
    expect(unconfigured.pegaConfigurationIssues[0]).toMatch(/PEGA_/);

    // Falling back to the mock would make a broken integration look healthy.
    expect(() => requirePegaConfigFrom(unconfigured)).toThrow(/not configured/i);
  });

  it("validates demo-control cookies", () => {
    const cookieStore = {
      get() {
        return { name: "northstar-demo-control", value: "northstar-26" };
      },
    };

    expect(isDemoAuthorizedCookie(cookieStore)).toBe(true);
  });
});

describe("error serialization at the BFF boundary", () => {
  it("returns the customer-safe message for a Pega failure, not the technical one", () => {
    const error = new PegaIntegrationError("VALIDATION", {
      technicalDetail: "POST /cases returned HTTP 400.",
      correlationId: "corr-123",
    });

    const serialized = serializeError(error);

    expect(serialized.statusCode).toBe(422);
    expect(serialized.message).toBe(
      "Some of the information provided could not be accepted.",
    );
    // The upstream detail must never cross the boundary.
    expect(serialized.message).not.toContain("HTTP 400");
    expect(serialized.message).not.toMatch(/Pega|\/cases/i);
  });

  it("maps each Pega failure kind onto the right status without leaking detail", () => {
    const cases: Array<[PegaFailureKind, number]> = [
      ["NOT_FOUND", 404],
      ["VERSION_CONFLICT", 409],
      ["VALIDATION", 422],
      ["RATE_LIMITED", 503],
      ["UNAVAILABLE", 502],
      ["TIMEOUT", 504],
      ["AUTH", 502],
      ["CONTRACT", 502],
    ];

    for (const [kind, expectedStatus] of cases) {
      const serialized = serializeError(
        new PegaIntegrationError(kind, {
          technicalDetail: "internal-only detail with /cases and HTTP 500",
        }),
      );

      expect(serialized.statusCode).toBe(expectedStatus);
      expect(serialized.message).not.toContain("internal-only detail");
    }
  });

  it("reports an unconfigured connection as a service problem, not a customer one", () => {
    const serialized = serializeError(
      new ConfigurationError("Missing PEGA_CLIENT_SECRET."),
    );

    expect(serialized.statusCode).toBe(503);
    expect(serialized.message).not.toMatch(/PEGA_CLIENT_SECRET|Missing/i);
  });

  it("treats a schema rejection as a client error rather than a server fault", () => {
    const result = applicantSchema.safeParse({ fullName: "x" });
    expect(result.success).toBe(false);

    const serialized = serializeError(result.error);
    expect(serialized.statusCode).toBe(422);
  });

  it("never returns a raw error message for an unexpected failure", () => {
    const serialized = serializeError(
      new Error("connect ECONNREFUSED 10.0.0.5:5432"),
    );

    expect(serialized.statusCode).toBe(500);
    expect(serialized.message).not.toContain("ECONNREFUSED");
    expect(serialized.message).not.toContain("10.0.0.5");
  });
});
