import { NextRequest, NextResponse } from "next/server";

import {
  getDemoControlEnabled,
  isDemoAuthorizedCookie,
} from "@/lib/onboarding/demo-auth";
import {
  getCurrentCaseEvents,
  getCurrentCaseView,
} from "@/lib/onboarding/engine";

export async function GET(request: NextRequest) {
  if (!getDemoControlEnabled()) {
    return NextResponse.json({ message: "Demo control is disabled." }, { status: 404 });
  }

  if (!isDemoAuthorizedCookie(request.cookies)) {
    return NextResponse.json({ message: "Unauthorised." }, { status: 401 });
  }

  return NextResponse.json({
    caseView: getCurrentCaseView(),
    events: getCurrentCaseEvents(),
  });
}
