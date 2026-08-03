import { NextResponse } from "next/server";

import { listTools } from "@/lib/services/registry";
import {
  CORRELATION_ID_HEADER,
  IDEMPOTENCY_KEY_HEADER,
  SERVICE_API_KEY_HEADER,
  authorizeServiceRequest,
} from "@/lib/services/service-auth";

/**
 * Tool discovery.
 *
 * Lets the orchestration team confirm which capabilities this environment
 * exposes and which of them demand an idempotency key, without reading source.
 */
export async function GET(request: Request) {
  const auth = authorizeServiceRequest(request);

  if (!auth.authorized) {
    return NextResponse.json({ message: "Unauthorised." }, { status: 401 });
  }

  return NextResponse.json(
    {
      invocationPath: "/api/services/{tool}",
      method: "POST",
      headers: {
        apiKey: SERVICE_API_KEY_HEADER,
        correlationId: CORRELATION_ID_HEADER,
        idempotencyKey: IDEMPOTENCY_KEY_HEADER,
      },
      tools: listTools(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
