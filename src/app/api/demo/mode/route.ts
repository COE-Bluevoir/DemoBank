import { NextRequest, NextResponse } from "next/server";

import { isPegaConnectionConfigured } from "@/lib/onboarding/adapters";
import {
  getDemoControlEnabled,
  isDemoAuthorizedCookie,
} from "@/lib/onboarding/demo-auth";
import { serializeError, updateMode } from "@/lib/onboarding/engine";
import { modeSchema } from "@/lib/onboarding/schemas";

export async function POST(request: NextRequest) {
  if (!getDemoControlEnabled()) {
    return NextResponse.json({ message: "Demo control is disabled." }, { status: 404 });
  }

  if (!isDemoAuthorizedCookie(request.cookies)) {
    return NextResponse.json({ message: "Unauthorised." }, { status: 401 });
  }

  try {
    const payload = modeSchema.parse(await request.json());

    if (payload.orchestrationMode === "mock-pega") {
      return NextResponse.json(
        {
          message:
            "Mock Pega is no longer selectable. Choose live Pega or AWS.",
        },
        { status: 409 },
      );
    }

    // Selecting live Pega without a configured connection would silently run
    // the mock engine and make a broken integration look healthy.
    if (payload.orchestrationMode === "pega" && !isPegaConnectionConfigured()) {
      return NextResponse.json(
        {
          message:
            "Live Pega mode is not configured in this environment. Set PEGA_BASE_URL, PEGA_TOKEN_URL, PEGA_CLIENT_ID and PEGA_CLIENT_SECRET.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(updateMode(payload.orchestrationMode));
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(
      { message: serialized.message },
      { status: serialized.statusCode },
    );
  }
}
