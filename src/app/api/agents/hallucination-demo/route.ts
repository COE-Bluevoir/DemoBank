import { NextResponse } from "next/server";
import { z } from "zod";

import { runHallucinationDemo } from "@/lib/agents/hallucination-demo";
import { HALLUCINATION_QUESTIONS } from "@/lib/agents/hallucination-questions";
import { logServerError } from "@/lib/observability/logger";

/**
 * Grounded-vs-ungrounded comparison for the governance console.
 *
 * Customer-facing surfaces never reach this: it exists to show the
 * difference on purpose, to a presenter, not to answer a real question.
 */

const requestSchema = z.object({
  questionId: z.enum(
    HALLUCINATION_QUESTIONS.map((item) => item.id) as [string, ...string[]],
  ),
  industryId: z.enum(["banking", "insurance", "telecom"]).default("banking"),
});

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
      { message: "That request could not be read." },
      { status: 422 },
    );
  }

  try {
    const result = await runHallucinationDemo(
      parsed.data.questionId,
      parsed.data.industryId,
    );

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logServerError({ scope: "hallucination-demo" }, error);

    return NextResponse.json(
      { message: "Unable to run the comparison right now." },
      { status: 503 },
    );
  }
}
