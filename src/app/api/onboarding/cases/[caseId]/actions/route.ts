import { NextResponse } from "next/server";

import { isReviewerOnlyAction } from "@/lib/onboarding/actions";
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

    // This is the customer's own endpoint. Reviewer actions reach the same
    // adapter, so without this an applicant could clear the human-review gate
    // holding their own case.
    if (isReviewerOnlyAction(payload.actionId)) {
      return NextResponse.json(
        { message: "That action is not available." },
        { status: 403 },
      );
    }

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
