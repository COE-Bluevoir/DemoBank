import { NextResponse } from "next/server";
import { z } from "zod";

import { compareExecutionPaths } from "@/lib/agents/compare";
import { AgentProviderError } from "@/lib/agents/provider";
import { logServerError } from "@/lib/observability/logger";

const requestSchema = z.object({
  message: z.string().min(1),
  industryId: z.enum(["banking", "insurance", "telecom"]).default("banking"),
});

/**
 * Runs one customer request through both execution paths and returns the
 * comparison. Interpretation happens once and is shared, so the difference
 * shown is architectural rather than two samples of the same model.
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

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "A message and industry are required." },
      { status: 422 },
    );
  }

  try {
    const comparison = await compareExecutionPaths(parsed.data);

    return NextResponse.json(comparison, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logServerError({ scope: "agents-compare" }, error);

    return NextResponse.json(
      {
        message:
          error instanceof AgentProviderError
            ? error.customerMessage
            : "We could not run the comparison right now.",
      },
      { status: 502 },
    );
  }
}
