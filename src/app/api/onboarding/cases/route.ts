import { NextResponse } from "next/server";

import { getAdapter } from "@/lib/onboarding/adapters";
import { getDemoSettings, serializeError } from "@/lib/onboarding/engine";
import { createCaseSchema } from "@/lib/onboarding/schemas";

export async function POST(request: Request) {
  try {
    const payload = createCaseSchema.parse(await request.json());
    const settings = getDemoSettings();
    const adapter = getAdapter(settings.orchestrationMode);
    const response = await adapter.createCase({
      ...payload,
      scenarioId: settings.scenarioId,
    });
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(
      { message: serialized.message },
      { status: serialized.statusCode },
    );
  }
}
