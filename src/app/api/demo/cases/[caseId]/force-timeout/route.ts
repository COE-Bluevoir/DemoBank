import { NextRequest, NextResponse } from "next/server";

import {
  getDemoControlEnabled,
  isDemoAuthorizedCookie,
} from "@/lib/onboarding/demo-auth";
import { fetchCaseEvents, forceTimeout, serializeError } from "@/lib/onboarding/engine";

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
    const caseView = forceTimeout(caseId);
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
