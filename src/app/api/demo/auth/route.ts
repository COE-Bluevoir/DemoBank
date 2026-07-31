import { NextResponse } from "next/server";

import {
  demoCookieName,
  getDemoControlEnabled,
  getDemoControlPasscode,
} from "@/lib/onboarding/demo-auth";
import { passcodeSchema } from "@/lib/onboarding/schemas";

export async function POST(request: Request) {
  if (!getDemoControlEnabled()) {
    return NextResponse.json({ message: "Demo control is disabled." }, { status: 404 });
  }

  const payload = passcodeSchema.parse(await request.json());

  if (payload.passcode !== getDemoControlPasscode()) {
    return NextResponse.json({ message: "Invalid passcode." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(demoCookieName(), payload.passcode, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
  });
  return response;
}
