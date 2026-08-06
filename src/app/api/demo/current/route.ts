import { NextRequest, NextResponse } from "next/server";

import {
  getDemoControlEnabled,
  isDemoAuthorizedCookie,
} from "@/lib/onboarding/demo-auth";
import { loadCurrentCase } from "@/lib/onboarding/current-case";

export async function GET(request: NextRequest) {
  if (!getDemoControlEnabled()) {
    return NextResponse.json({ message: "Demo control is disabled." }, { status: 404 });
  }

  if (!isDemoAuthorizedCookie(request.cookies)) {
    return NextResponse.json({ message: "Unauthorised." }, { status: 401 });
  }

  const requested =
    new URL(request.url).searchParams.get("caseId") ?? undefined;

  return NextResponse.json(await loadCurrentCase(requested), {
    headers: { "Cache-Control": "no-store" },
  });
}
