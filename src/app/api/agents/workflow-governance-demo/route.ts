import { NextResponse } from "next/server";

import { runWorkflowGovernanceDemo } from "@/lib/pega/workflow-governance-demo";
import { logServerError } from "@/lib/observability/logger";

/**
 * Proves Pega's own case-view contract rejects a malformed submission, live.
 *
 * No request body — this always runs the same fixed proof against a fresh
 * throwaway case. Customer-facing surfaces never reach this.
 */
export async function POST() {
  try {
    const result = await runWorkflowGovernanceDemo();

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logServerError({ scope: "workflow-governance-demo" }, error);

    return NextResponse.json(
      { message: "Unable to run the workflow governance check right now." },
      { status: 503 },
    );
  }
}
