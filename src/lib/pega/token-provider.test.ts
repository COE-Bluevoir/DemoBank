// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PegaConnectionConfig } from "@/lib/config/env";
import { PegaIntegrationError } from "@/lib/pega/errors";
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

function tokenResponse(accessToken: string, expiresIn = 3600) {
  return new Response(
    JSON.stringify({ access_token: accessToken, expires_in: expiresIn }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Pega token provider", () => {
  it("caches a token instead of re-authenticating on every call", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(tokenResponse("token-1"));

    const provider = new PegaTokenProvider(config);

    expect(await provider.getAccessToken()).toBe("token-1");
    expect(await provider.getAccessToken()).toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("collapses concurrent refreshes into a single token request", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(tokenResponse("token-1"));

    const provider = new PegaTokenProvider(config);
    const tokens = await Promise.all([
      provider.getAccessToken(),
      provider.getAccessToken(),
      provider.getAccessToken(),
    ]);

    expect(tokens).toEqual(["token-1", "token-1", "token-1"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-authenticates once the token expires", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(tokenResponse("token-1", 120))
      .mockResolvedValueOnce(tokenResponse("token-2", 120));

    let now = 0;
    const provider = new PegaTokenProvider(config, () => now);

    expect(await provider.getAccessToken()).toBe("token-1");

    // 120s lifetime minus 60s skew means the token is stale after 60s.
    now = 61_000;

    expect(await provider.getAccessToken()).toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("re-authenticates after an explicit invalidation", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(tokenResponse("token-1"))
      .mockResolvedValueOnce(tokenResponse("token-2"));

    const provider = new PegaTokenProvider(config);

    await provider.getAccessToken();
    provider.invalidate();

    expect(await provider.getAccessToken()).toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends client credentials as a form-encoded grant", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(tokenResponse("token-1"));

    await new PegaTokenProvider(config).getAccessToken();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(config.tokenUrl);
    expect(init?.method).toBe("POST");
    expect(String((init?.body as URLSearchParams).get("grant_type"))).toBe(
      "client_credentials",
    );
  });

  it("translates a rejected credential into an auth failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 401 }),
    );

    await expect(
      new PegaTokenProvider(config).getAccessToken(),
    ).rejects.toMatchObject({ kind: "AUTH" });
  });

  it("never puts the client secret into the error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "bad client-secret" }), {
        status: 400,
      }),
    );

    const error = await new PegaTokenProvider(config)
      .getAccessToken()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PegaIntegrationError);
    expect(JSON.stringify(error)).not.toContain("client-secret");
    expect((error as PegaIntegrationError).message).not.toContain(
      "client-secret",
    );
  });

  it("reports a malformed token payload as a contract failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ token: "wrong-field" }), { status: 200 }),
    );

    await expect(
      new PegaTokenProvider(config).getAccessToken(),
    ).rejects.toMatchObject({ kind: "CONTRACT" });
  });

  it("reports an unreachable token endpoint as unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      new PegaTokenProvider(config).getAccessToken(),
    ).rejects.toMatchObject({ kind: "UNAVAILABLE" });
  });
});
