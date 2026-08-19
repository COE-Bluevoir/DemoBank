import { NextResponse } from "next/server";

import { getAdapter } from "@/lib/onboarding/adapters";
import {
  getDemoSettings,
  serializeError,
  setCurrentCaseId,
} from "@/lib/onboarding/engine";
import { createCaseSchema } from "@/lib/onboarding/schemas";

export async function POST(request: Request) {
  try {
    const payload = createCaseSchema.parse(await request.json());
    const settings = getDemoSettings();

    // Orchestration mode is fixed for this deployment (see /api/demo/mode) —
    // a client-supplied value here is never trusted. That closes a hole
    // where a stale or hand-crafted `?mode=mock-pega` link could silently
    // shunt a case into the mock engine, which is what actually caused
    // "Pega mode isn't working" despite live Pega being correctly
    // configured and reachable (confirmed 2026-08-19).
    const mode = settings.orchestrationMode;

    const response = await getAdapter(mode).createCase({
      ...payload,
      scenarioId: settings.scenarioId,
    });

    // Lets the operations surface follow the case that was just opened,
    // whichever orchestration created it.
    setCurrentCaseId(response.caseId);

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(
      { message: serialized.message },
      { status: serialized.statusCode },
    );
  }
}
