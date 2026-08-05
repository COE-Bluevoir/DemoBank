import { NextResponse } from "next/server";

import { orchestratorRequestSchema } from "@/lib/agents/contracts";
import { runOrchestrator } from "@/lib/agents/orchestrator";
import { AgentProviderError } from "@/lib/agents/provider";
import { logServerError } from "@/lib/observability/logger";

/**
 * Conversational onboarding endpoint.
 *
 * Returns the agent's reply plus whether the interaction requires governed
 * execution. It deliberately does not create or advance a case: the caller
 * decides to enter the workflow, so the boundary between conversation and
 * governed action stays explicit rather than being a side effect of chatting.
 */
export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = orchestratorRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "The request did not match the expected shape.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }

  try {
    const result = await runOrchestrator(parsed.data);

    return NextResponse.json(
      {
        reply: result.policyAnswer?.answer ?? result.decision.customerResponse,
        intent: result.decision.intent,
        requiresGovernedExecution: result.requiresGovernedExecution,
        extractedFields: result.decision.extractedFields,
        confidence: result.decision.confidence,
        grounded: result.policyAnswer?.grounded,
        // The governance trail is returned so the console can render how the
        // answer was produced, not only what it said.
        governance: result.records,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logServerError({ scope: "agents" }, error);

    const message =
      error instanceof AgentProviderError
        ? error.customerMessage
        : "We could not process that request right now. Please try again.";

    return NextResponse.json({ message }, { status: 502 });
  }
}
