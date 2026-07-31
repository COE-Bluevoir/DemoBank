import { NextRequest, NextResponse } from "next/server";

import {
  getDemoControlEnabled,
  isDemoAuthorizedCookie,
} from "@/lib/onboarding/demo-auth";
import { advanceCase, fetchCaseEvents, fetchCaseView, serializeError } from "@/lib/onboarding/engine";

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
    const url = new URL(request.url);
    const caseView =
      url.searchParams.get("peek") === "true"
        ? fetchCaseView(caseId)
        : advanceCase(caseId);

    return NextResponse.json({
      caseView,
      events: fetchCaseEvents(caseId),
    });
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(
      { message: serialized.message },
      { status: serialized.statusCode },
    );
  }
}
