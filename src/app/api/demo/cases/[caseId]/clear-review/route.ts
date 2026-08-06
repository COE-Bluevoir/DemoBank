import { NextRequest, NextResponse } from "next/server";

import { getAdapterForCase } from "@/lib/onboarding/adapters";
import {
  getDemoControlEnabled,
  isDemoAuthorizedCookie,
} from "@/lib/onboarding/demo-auth";
import { serializeError } from "@/lib/onboarding/engine";

/**
 * A reviewer clears a case that policy held for human attention.
 *
 * Routed through the adapter so it works whichever orchestration owns the
 * case: every one of them holds cases for review, and the operations surface
 * should not have to know which is running.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ caseId: string }> },
) {
  if (!getDemoControlEnabled()) {
    return NextResponse.json({ message: "Demo control is disabled." }, { status: 404 });
  }

  if (!isDemoAuthorizedCookie(request.cookies)) {
    return NextResponse.json({ message: "Unauthorised." }, { status: 401 });
  }

  try {
    const { caseId } = await context.params;
    const adapter = getAdapterForCase(caseId);

    const caseView = await adapter.submitAction(caseId, {
      actionId: "CLEAR_REVIEW",
      expectedCaseVersion: (await adapter.getCase(caseId)).caseVersion,
    });

    return NextResponse.json({
      caseView,
      events: await adapter.getEvents(caseId),
    });
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(
      { message: serialized.message },
      { status: serialized.statusCode },
    );
  }
}
