// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ConfigurationError, loadServerConfigFrom } from "@/lib/config/env";

const PEGA_ENV = {
  PEGA_BASE_URL: "https://pega.example.test/prweb/api/application/v2",
  PEGA_TOKEN_URL: "https://pega.example.test/prweb/oauth2/v1/token",
  PEGA_CLIENT_ID: "client-id",
  PEGA_CLIENT_SECRET: "client-secret",
};

describe("server configuration", () => {
  it("applies safe defaults when nothing is configured", () => {
    const config = loadServerConfigFrom({});

    expect(config.orchestrationMode).toBe("mock-pega");
    expect(config.defaultScenarioId).toBe("ADDRESS_PEP_REVIEW");
    expect(config.demoControlEnabled).toBe(true);
    expect(config.pega).toBeUndefined();
  });

  it("builds the Pega connection when every required value is present", () => {
    const config = loadServerConfigFrom({ ...PEGA_ENV, ORCHESTRATION_MODE: "pega" });

    expect(config.pega).toBeDefined();
    expect(config.pega?.clientId).toBe("client-id");
    expect(config.pega?.timeoutMs).toBe(5000);
    expect(config.pega?.uploadTimeoutMs).toBe(60_000);
    expect(config.pega?.maxRetries).toBe(1);
    expect(config.pegaConfigurationIssues).toHaveLength(0);
  });

  it("defaults to live Pega when the connection is configured", () => {
    const config = loadServerConfigFrom(PEGA_ENV);

    expect(config.orchestrationMode).toBe("pega");
  });

  it("strips a trailing slash from the base URL so paths join cleanly", () => {
    const config = loadServerConfigFrom({
      ...PEGA_ENV,
      PEGA_BASE_URL: "https://pega.example.test/api/",
    });

    expect(config.pega?.baseUrl).toBe("https://pega.example.test/api");
  });

  it("refuses to start in pega mode without credentials", () => {
    expect(() => loadServerConfigFrom({ ORCHESTRATION_MODE: "pega" })).toThrow(
      ConfigurationError,
    );
  });

  it("names the missing Pega settings instead of failing vaguely", () => {
    const config = loadServerConfigFrom({
      PEGA_BASE_URL: PEGA_ENV.PEGA_BASE_URL,
      PEGA_TOKEN_URL: PEGA_ENV.PEGA_TOKEN_URL,
    });

    expect(config.pegaConfigurationIssues[0]).toContain("PEGA_CLIENT_ID");
    expect(config.pegaConfigurationIssues[0]).toContain("PEGA_CLIENT_SECRET");
  });

  it("keeps mock mode usable even when Pega is unconfigured", () => {
    const config = loadServerConfigFrom({ ORCHESTRATION_MODE: "mock-pega" });

    expect(config.orchestrationMode).toBe("mock-pega");
    expect(config.pega).toBeUndefined();
  });

  it("rejects a malformed Pega base URL", () => {
    expect(() =>
      loadServerConfigFrom({ ...PEGA_ENV, PEGA_BASE_URL: "not-a-url" }),
    ).toThrow(ConfigurationError);
  });

  it("parses boolean and numeric settings from strings", () => {
    const config = loadServerConfigFrom({
      ...PEGA_ENV,
      DEMO_CONTROL_ENABLED: "false",
      PEGA_TIMEOUT_MS: "5000",
      PEGA_MAX_RETRIES: "0",
    });

    expect(config.demoControlEnabled).toBe(false);
    expect(config.pega?.timeoutMs).toBe(5000);
    expect(config.pega?.maxRetries).toBe(0);
  });

  it("rejects an out-of-range timeout rather than silently clamping it", () => {
    expect(() =>
      loadServerConfigFrom({ ...PEGA_ENV, PEGA_TIMEOUT_MS: "999999" }),
    ).toThrow(ConfigurationError);
  });
});
