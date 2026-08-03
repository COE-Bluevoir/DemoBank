import { NextResponse } from "next/server";

import {
  deterministicExecutionId,
  deterministicReference,
} from "@/lib/services/deterministic";
import {
  IdempotencyConflictError,
  runIdempotent,
} from "@/lib/services/idempotency";
import { getToolDefinition, isToolName } from "@/lib/services/registry";
import {
  IDEMPOTENCY_KEY_HEADER,
  authorizeServiceRequest,
  correlationIdFrom,
  idempotencyKeyFrom,
} from "@/lib/services/service-auth";

/**
 * Tool invocation endpoint for the orchestration layer.
 *
 * `POST /api/services/{tool}` with:
 *   x-service-api-key : shared secret
 *   x-correlation-id  : case correlation ID, echoed into the response
 *   x-idempotency-key : required for tools with external side effects
 *
 * Only tools present in the registry allowlist can be invoked. Request bodies
 * are schema-validated before any handler runs, and document *content* never
 * appears in a request or a log line — only storage references do.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ tool: string }> },
) {
  const auth = authorizeServiceRequest(request);

  if (!auth.authorized) {
    return NextResponse.json({ message: "Unauthorised." }, { status: 401 });
  }

  const { tool } = await context.params;

  if (!isToolName(tool)) {
    return NextResponse.json(
      { message: "The requested tool is not available." },
      { status: 404 },
    );
  }

  const definition = getToolDefinition(tool);
  const correlationId = correlationIdFrom(request);
  const idempotencyKey = idempotencyKeyFrom(request);

  if (definition.requiresIdempotencyKey && !idempotencyKey) {
    return NextResponse.json(
      {
        message: `The ${tool} tool has an external side effect and requires an ${IDEMPOTENCY_KEY_HEADER} header.`,
      },
      { status: 400 },
    );
  }

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = definition.requestSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "The request payload did not match the tool contract.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 422 },
    );
  }

  try {
    const { result, replayed } = await runIdempotent(
      tool,
      idempotencyKey,
      parsed.data,
      () => definition.handler(parsed.data),
    );

    const seed = `${correlationId}:${JSON.stringify(parsed.data)}`;

    return NextResponse.json(
      {
        meta: {
          tool,
          providerReference: deterministicReference("PRV", seed),
          toolVersion: definition.version,
          correlationId,
          executionId: deterministicExecutionId(tool, seed),
          completedAt: new Date().toISOString(),
          replayed,
        },
        result,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof IdempotencyConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { message: "The tool could not complete the request." },
      { status: 500 },
    );
  }
}
