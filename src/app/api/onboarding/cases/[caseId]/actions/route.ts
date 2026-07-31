import { NextResponse } from "next/server";

import { getAdapterForCase } from "@/lib/onboarding/adapters";
import { serializeError } from "@/lib/onboarding/engine";
import { submitActionSchema } from "@/lib/onboarding/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    const { caseId } = await context.params;
    const payload = submitActionSchema.parse(await request.json());
    const adapter = getAdapterForCase(caseId);
    const response = await adapter.submitAction(caseId, payload);
    return NextResponse.json(response);
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(
      { message: serialized.message },
      { status: serialized.statusCode },
    );
  }
}
