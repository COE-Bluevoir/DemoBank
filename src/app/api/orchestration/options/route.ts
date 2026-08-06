import { NextResponse } from "next/server";

import { isPegaConnectionConfigured } from "@/lib/onboarding/adapters";
import { getDemoSettings, getModeOptions } from "@/lib/onboarding/engine";

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

  const options = getModeOptions()
    // The mock is a local development aid rather than a choice to put in front
    // of a customer — but when it is deliberately selected it must still be
    // listed, otherwise the switch would claim something else is running.
    .filter((option) => option.id !== "mock-pega" || activeMode === "mock-pega")
    .map((option) => ({
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
