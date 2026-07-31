import { NextResponse } from "next/server";

import { getAdapterForCase } from "@/lib/onboarding/adapters";
import { serializeError } from "@/lib/onboarding/engine";

export async function GET(
  _request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    const { caseId } = await context.params;
    const adapter = getAdapterForCase(caseId);
    const response = await adapter.getCase(caseId);
    return NextResponse.json(response);
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(
      { message: serialized.message },
      { status: serialized.statusCode },
    );
  }
}
