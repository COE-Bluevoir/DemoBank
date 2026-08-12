import { NextResponse } from "next/server";
import { z } from "zod";

import { getAssistantProvider } from "@/lib/assistant/registry";
import { AssistantUnavailableError } from "@/lib/assistant/provider";
import { logServerError } from "@/lib/observability/logger";

/**
 * The conversational assistant.
 *
 * Answers questions and nothing else. It has no path to create a case,
 * advance one, or upload anything — a chat box that can act on an application
 * is an authority the customer never granted it, and would sit outside every
 * control the workflow applies.
 */

const requestSchema = z.object({
  message: z.string().min(1).max(1000),
  industryId: z.enum(["banking", "insurance", "telecom"]).default("banking"),
  caseId: z.string().max(120).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["customer", "assistant"]),
        content: z.string().max(2000),
      }),
    )
    // Bounded so a long conversation cannot grow the request without limit.
    .max(20)
    .default([]),
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
      { message: "That message could not be read." },
      { status: 422 },
    );
  }

  try {
    const reply = await getAssistantProvider().respond(parsed.data);

    return NextResponse.json(
      {
        message: reply.message,
        suggestions: reply.suggestions ?? [],
        source: reply.source,
        confidence: reply.confidence,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logServerError({ scope: "assistant" }, error);

    // The customer sees a neutral message; the reason stays in the log.
    return NextResponse.json(
      {
        message:
          error instanceof AssistantUnavailableError
            ? error.customerMessage
            : "I cannot answer that right now. Please try again in a moment.",
      },
      { status: 503 },
    );
  }
}
