// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { PegaConnectionConfig } from "@/lib/config/env";
import { PegaHttpClient } from "@/lib/pega/http-client";
import { PegaTokenProvider } from "@/lib/pega/token-provider";

const config: PegaConnectionConfig = {
  baseUrl: "https://pega.example.test/api",
  tokenUrl: "https://pega.example.test/token",
  clientId: "client-id",
  clientSecret: "client-secret",
  caseTypeId: "NorthStar-Onboarding",
  timeoutMs: 5000,
  uploadTimeoutMs: 60_000,
  maxRetries: 2,
  tokenSkewSeconds: 60,
};

const schema = z.object({ ok: z.boolean() });

/** Token provider stub so tests exercise the client, not authentication. */
function stubTokenProvider(): PegaTokenProvider {
  return {
    getAccessToken: async () => "test-token",
    invalidate: () => {},
  } as unknown as PegaTokenProvider;
}

function client() {
  return new PegaHttpClient(config, stubTokenProvider());
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Pega HTTP client", () => {
  it("returns the validated payload on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));

    const result = await client().request({
      method: "GET",
      path: "/cases/ONB-1",
      schema,
    });

    expect(result).toEqual({ ok: true });
  });

  it("propagates correlation and idempotency headers", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ok: true }));

    await client().request({
      method: "POST",
      path: "/cases",
      schema,
      body: { productCode: "EVERYDAY_PLUS" },
      correlationId: "corr-123",
      idempotencyKey: "key-456",
      eTag: "etag-789",
    });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("x-correlation-id")).toBe("corr-123");
    expect(headers.get("x-idempotency-key")).toBe("key-456");
    expect(headers.get("If-Match")).toBe("etag-789");
    expect(headers.get("Authorization")).toBe("Bearer test-token");
  });

  it("never caches orchestration state", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ok: true }));

    await client().request({ method: "GET", path: "/cases/ONB-1", schema });

    expect(fetchMock.mock.calls[0][1]?.cache).toBe("no-store");
  });

  it("builds the URL from the base URL and query parameters", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ok: true }));

    await client().request({
      method: "GET",
      path: "/cases/ONB-1",
      schema,
      query: { include: "events", skip: undefined },
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://pega.example.test/api/cases/ONB-1?include=events",
    );
  });

  it("retries a transient server error and then succeeds", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ message: "boom" }, 503))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await client().request({
      method: "GET",
      path: "/cases/ONB-1",
      schema,
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured retry budget", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ message: "boom" }, 503));

    await expect(
      client().request({ method: "GET", path: "/cases/ONB-1", schema }),
    ).rejects.toMatchObject({ kind: "UNAVAILABLE" });

    // Initial attempt plus maxRetries.
    expect(fetchMock).toHaveBeenCalledTimes(config.maxRetries + 1);
  });

  it("does not retry a validation failure", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ message: "bad" }, 422));

    await expect(
      client().request({ method: "POST", path: "/cases", schema, body: {} }),
    ).rejects.toMatchObject({ kind: "VALIDATION" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a stale update as a version conflict", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ message: "conflict" }, 409),
    );

    await expect(
      client().request({ method: "POST", path: "/cases/ONB-1/actions", schema }),
    ).rejects.toMatchObject({ kind: "VERSION_CONFLICT", statusCode: 409 });
  });

  it("retries once with a fresh token after a 401", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ message: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await client().request({
      method: "GET",
      path: "/cases/ONB-1",
      schema,
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a response that does not match the contract", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ unexpected: "shape" }),
    );

    await expect(
      client().request({ method: "GET", path: "/cases/ONB-1", schema }),
    ).rejects.toMatchObject({ kind: "CONTRACT" });
  });

  it("rejects a non-JSON body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html>gateway error</html>", { status: 200 }),
    );

    await expect(
      client().request({ method: "GET", path: "/cases/ONB-1", schema }),
    ).rejects.toMatchObject({ kind: "CONTRACT" });
  });

  it("reports a network failure as unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNRESET"));

    await expect(
      client().request({ method: "GET", path: "/cases/ONB-1", schema }),
    ).rejects.toMatchObject({ kind: "UNAVAILABLE" });
  });

  it("reports a timeout distinctly so the UI can show a saved-application message", async () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(timeout);

    await expect(
      client().request({ method: "GET", path: "/cases/ONB-1", schema }),
    ).rejects.toMatchObject({ kind: "TIMEOUT", statusCode: 504 });

    // Timeouts are not retried: waiting the full budget again would make a
    // slow connection look even slower.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
