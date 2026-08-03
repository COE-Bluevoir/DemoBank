import { expect, test } from "@playwright/test";

/**
 * Coverage for the surfaces the orchestration layer connects to:
 * health/readiness, the tool allowlist, tool invocation with idempotency,
 * and evidence retrieval.
 *
 * These run without a live Pega instance, which is the point: the Pega team
 * can verify this side of the integration before their case type exists.
 */

test.describe("integration readiness", () => {
  test("health endpoint reports the active orchestration mode", async ({
    request,
  }) => {
    const response = await request.get("/api/health");

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(["mock-pega", "pega", "non-pega"]).toContain(body.orchestrationMode);
    expect(body.services.toolCount).toBe(9);
  });

  test("health endpoint reports credential presence without exposing values", async ({
    request,
  }) => {
    const response = await request.get("/api/health");
    const body = await response.json();

    // Naming a missing variable is intentional and safe; carrying its value
    // is not. The response exposes no credential field at all.
    expect(body.pega).not.toHaveProperty("clientSecret");
    expect(body.pega).not.toHaveProperty("clientId");
    expect(typeof body.pega.configured).toBe("boolean");
  });
});

test.describe("tool services", () => {
  test("publishes the tool allowlist for the orchestration team", async ({
    request,
  }) => {
    const response = await request.get("/api/services");

    expect(response.status()).toBe(200);

    const body = await response.json();
    const names = body.tools.map((tool: { name: string }) => tool.name);

    expect(names).toContain("screen-pep");
    expect(names).toContain("create-customer");
    expect(names).toHaveLength(9);
  });

  test("rejects a tool that is not on the allowlist", async ({ request }) => {
    const response = await request.post("/api/services/drop-database", {
      data: {},
    });

    expect(response.status()).toBe(404);
  });

  test("rejects a payload that does not match the tool contract", async ({
    request,
  }) => {
    const response = await request.post("/api/services/screen-pep", {
      data: { caseId: "ONB-1" },
    });

    expect(response.status()).toBe(422);
    expect((await response.json()).issues.length).toBeGreaterThan(0);
  });

  test("returns structured screening evidence rather than free text", async ({
    request,
  }) => {
    const response = await request.post("/api/services/screen-pep", {
      headers: { "x-correlation-id": "corr-e2e-1" },
      data: {
        caseId: "ONB-10027",
        fullName: "Ananya Rao",
        dateOfBirth: "1992-08-14",
        nationality: "Indian",
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.result.outcome).toBe("POTENTIAL_MATCH");
    expect(body.result.matchConfidence).toBeLessThan(0.7);
    expect(body.meta.correlationId).toBe("corr-e2e-1");
    expect(body.meta.executionId).toMatch(/^exec-/);
  });

  test("requires an idempotency key for customer creation", async ({
    request,
  }) => {
    const response = await request.post("/api/services/create-customer", {
      data: {
        caseId: "ONB-10027",
        productCode: "EVERYDAY_PLUS",
        applicant: {
          fullName: "Ananya Rao",
          dateOfBirth: "1992-08-14",
          email: "ananya.rao@example.test",
          mobile: "+91 90000 00000",
          address: {
            addressLine1: "18 Lake View Road",
            city: "Hyderabad",
            region: "Telangana",
            postalCode: "500081",
            country: "India",
          },
        },
      },
    });

    expect(response.status()).toBe(400);
    expect((await response.json()).message).toContain("x-idempotency-key");
  });

  test("a retried customer creation does not open a second account", async ({
    request,
  }) => {
    const payload = {
      caseId: `ONB-${Date.now()}`,
      productCode: "EVERYDAY_PLUS",
      applicant: {
        fullName: "Ananya Rao",
        dateOfBirth: "1992-08-14",
        email: "ananya.rao@example.test",
        mobile: "+91 90000 00000",
        address: {
          addressLine1: "18 Lake View Road",
          city: "Hyderabad",
          region: "Telangana",
          postalCode: "500081",
          country: "India",
        },
      },
    };
    const headers = { "x-idempotency-key": `key-${payload.caseId}` };

    const first = await request.post("/api/services/create-customer", {
      headers,
      data: payload,
    });
    const retry = await request.post("/api/services/create-customer", {
      headers,
      data: payload,
    });

    const firstBody = await first.json();
    const retryBody = await retry.json();

    expect(firstBody.meta.replayed).toBe(false);
    expect(retryBody.meta.replayed).toBe(true);
    expect(retryBody.result.customerId).toBe(firstBody.result.customerId);
    expect(retryBody.result.accountId).toBe(firstBody.result.accountId);
  });

  test("rejects an idempotency key reused with a different payload", async ({
    request,
  }) => {
    const headers = { "x-idempotency-key": `key-conflict-${Date.now()}` };
    const base = {
      caseId: "ONB-10027",
      templateId: "WELCOME_ACCOUNT_OPENED",
      customerFirstName: "Ananya",
      productName: "Everyday Plus Account",
    };

    await request.post("/api/services/generate-communication", {
      headers,
      data: base,
    });
    const conflict = await request.post("/api/services/generate-communication", {
      headers,
      data: { ...base, customerFirstName: "Someone Else" },
    });

    expect(conflict.status()).toBe(409);
  });

  test("keeps screening vocabulary out of generated customer messages", async ({
    request,
  }) => {
    const response = await request.post("/api/services/generate-communication", {
      data: {
        caseId: "ONB-10027",
        templateId: "WELCOME_ACCOUNT_OPENED",
        customerFirstName: "Ananya",
        productName: "Everyday Plus Account",
        customerId: "CUST-100482",
        accountId: "ACC-29814",
      },
    });

    const body = await response.json();
    const message = `${body.result.subject} ${body.result.body}`;

    expect(message).not.toMatch(/PEP|sanction|screening|confidence/i);
    expect(message).toContain("CUST-100482");
  });
});

test.describe("document handling", () => {
  test("rejects a file whose contents do not match its declared type", async ({
    request,
  }) => {
    const created = await request.post("/api/onboarding/cases", {
      data: {
        productCode: "EVERYDAY_PLUS",
        channel: "WEB",
        scenarioId: "HAPPY_PATH",
      },
    });
    const { caseId } = await created.json();

    const response = await request.post(
      `/api/onboarding/cases/${caseId}/documents`,
      {
        multipart: {
          kind: "IDENTITY",
          file: {
            name: "not-really.pdf",
            mimeType: "application/pdf",
            // Windows executable header masquerading as a PDF.
            buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]),
          },
        },
      },
    );

    expect(response.status()).toBe(422);
  });

  test("stores an upload and serves it back to the orchestration layer", async ({
    request,
  }) => {
    const created = await request.post("/api/onboarding/cases", {
      data: {
        productCode: "EVERYDAY_PLUS",
        channel: "WEB",
        scenarioId: "HAPPY_PATH",
      },
    });
    const { caseId } = await created.json();

    const pdf = Buffer.concat([
      Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
      Buffer.from("\nfictional demo document\n"),
    ]);

    const upload = await request.post(
      `/api/onboarding/cases/${caseId}/documents`,
      {
        multipart: {
          kind: "IDENTITY",
          file: {
            name: "identity.pdf",
            mimeType: "application/pdf",
            buffer: pdf,
          },
        },
      },
    );

    expect(upload.status()).toBe(201);

    // The case view carries the storage handle the orchestration layer uses.
    const caseView = await (
      await request.get(`/api/onboarding/cases/${caseId}`)
    ).json();
    const stored = caseView.documents.find(
      (document: { kind: string }) => document.kind === "IDENTITY",
    );

    expect(stored.storageReference).toBeTruthy();

    const retrieved = await request.get(
      `/api/internal/documents/${stored.storageReference}`,
    );

    expect(retrieved.status()).toBe(200);
    expect(Buffer.from(await retrieved.body())).toEqual(pdf);
  });

  test("returns not-found for a traversing storage reference", async ({
    request,
  }) => {
    const response = await request.get(
      "/api/internal/documents/..%2F..%2Fpackage.json",
    );

    expect(response.status()).toBe(404);
  });
});
