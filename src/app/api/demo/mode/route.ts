import { NextRequest, NextResponse } from "next/server";

import {
  getDemoControlEnabled,
  isDemoAuthorizedCookie,
} from "@/lib/onboarding/demo-auth";
import { getDemoSettings } from "@/lib/onboarding/engine";

/**
 * Orchestration mode is fixed for this deployment, not presenter-toggleable.
 *
 * It used to be switchable at runtime, but the switch's state lived in a
 * per-instance store (a local file, or process memory) that Amplify's
 * parallel server instances don't share — one instance's toggle could leave
 * a case running on the mock engine while everything else, and every
 * diagnostic, correctly reported live Pega as configured and reachable.
 * Locking this to whatever ORCHESTRATION_MODE (or its auto-detected
 * default) resolves to at boot removes the entire class of bug: there is no
 * toggle left to end up stuck.
 */
export async function POST(request: NextRequest) {
  if (!getDemoControlEnabled()) {
    return NextResponse.json({ message: "Demo control is disabled." }, { status: 404 });
  }

  if (!isDemoAuthorizedCookie(request.cookies)) {
    return NextResponse.json({ message: "Unauthorised." }, { status: 401 });
  }

  return NextResponse.json(
    {
      message: `Orchestration mode is fixed to "${getDemoSettings().orchestrationMode}" for this deployment and cannot be changed at runtime.`,
    },
    { status: 409 },
  );
}
