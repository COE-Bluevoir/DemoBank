import { NextResponse } from "next/server";

import { getServerConfig } from "@/lib/config/env";
import { isPegaConnectionConfigured } from "@/lib/onboarding/adapters";
import { getDemoSettings, getModeOptions } from "@/lib/onboarding/engine";
import { getTokenProvider } from "@/lib/pega/token-provider";

/**
 * Which orchestrations this environment can actually run.
 *
 * The switch needs this before the customer picks, so an unavailable option
 * can say why rather than failing after they commit. Nothing here reveals a
 * credential — only whether one is present.
 *
 * The AWS path is never gated: it falls back to a deterministic provider when
 * no model is reachable, so the journey completes either way.
 */
export async function GET() {
  const pegaReady = isPegaConnectionConfigured();
  const activeMode = getDemoSettings().orchestrationMode;
  const pega = getServerConfig().pega;

  // Acquire the access token while the presenter is still choosing a journey,
  // so the first customer click does not wait on OAuth.
  if (pega) {
    void getTokenProvider(pega).getAccessToken().catch(() => undefined);
  }

  const options = getModeOptions().map((option) => ({
    ...option,
    unavailableReason:
      option.id === "pega" && !pegaReady
        ? "Pega is not configured in this environment."
        : undefined,
  }));

  return NextResponse.json(
    { options, activeMode },
    { headers: { "Cache-Control": "no-store" } },
  );
}
