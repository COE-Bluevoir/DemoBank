import { NextResponse } from "next/server";

import { runDecisionDemo } from "@/lib/agents/decision-demo";
import { logServerError } from "@/lib/observability/logger";

export async function POST() {
  try {
    const result = await runDecisionDemo();

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logServerError({ scope: "decision-demo" }, error);

    return NextResponse.json(
      { message: "Unable to run the comparison right now." },
      { status: 503 },
    );
  }
}
