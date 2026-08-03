import { NextResponse } from "next/server";

import { getServerConfig } from "@/lib/config/env";
import { PegaTokenProvider } from "@/lib/pega/token-provider";
import { PegaIntegrationError } from "@/lib/pega/errors";
import { listTools } from "@/lib/services/registry";

/**
 * Integration readiness probe.
 *
 * Answers the question the Pega team actually needs answered during setup:
 * "is this environment configured and can it reach Pega right now?"
 *
 * Secrets are never echoed — only whether they are present. `?deep=true`
 * additionally attempts a real token acquisition.
 */
export async function GET(request: Request) {
  const config = getServerConfig();
  const deep = new URL(request.url).searchParams.get("deep") === "true";

  const pegaStatus: {
    configured: boolean;
    issues: string[];
    baseUrl?: string;
    caseTypeId?: string;
    reachable?: boolean;
    detail?: string;
  } = {
    configured: Boolean(config.pega),
    issues: config.pegaConfigurationIssues,
    baseUrl: config.pega?.baseUrl,
    caseTypeId: config.pega?.caseTypeId,
  };

  if (deep && config.pega) {
    try {
      await new PegaTokenProvider(config.pega).getAccessToken();
      pegaStatus.reachable = true;
    } catch (error) {
      pegaStatus.reachable = false;
      pegaStatus.detail =
        error instanceof PegaIntegrationError
          ? `${error.kind}: ${error.technicalDetail ?? "token acquisition failed"}`
          : "Token acquisition failed.";
    }
  }

  const healthy =
    config.orchestrationMode !== "pega" ||
    (pegaStatus.configured && pegaStatus.reachable !== false);

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      orchestrationMode: config.orchestrationMode,
      pega: pegaStatus,
      services: {
        authenticationRequired: Boolean(config.serviceApiKey),
        toolCount: listTools().length,
      },
      demoControlEnabled: config.demoControlEnabled,
      checkedAt: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
