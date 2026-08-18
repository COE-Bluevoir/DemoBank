import { NextRequest, NextResponse } from "next/server";

import {
  getDemoControlEnabled,
  isDemoAuthorizedCookie,
} from "@/lib/onboarding/demo-auth";
import { serializeError, updatePegaDemoMode } from "@/lib/onboarding/engine";
import { pegaDemoModeSchema } from "@/lib/onboarding/schemas";

export async function POST(request: NextRequest) {
  if (!getDemoControlEnabled()) {
    return NextResponse.json({ message: "Demo control is disabled." }, { status: 404 });
  }

  if (!isDemoAuthorizedCookie(request.cookies)) {
    return NextResponse.json({ message: "Unauthorised." }, { status: 401 });
  }

  try {
    const payload = pegaDemoModeSchema.parse(await request.json());
    return NextResponse.json(updatePegaDemoMode(payload.enabled));
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(
      { message: serialized.message },
      { status: serialized.statusCode },
    );
  }
}
