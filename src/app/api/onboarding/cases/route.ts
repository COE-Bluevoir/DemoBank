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

    // The customer's choice wins where they made one. Falling back to the
    // configured default keeps existing callers working unchanged.
    const mode = payload.orchestrationMode ?? settings.orchestrationMode;

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
