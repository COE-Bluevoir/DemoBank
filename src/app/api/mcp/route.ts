import { NextResponse } from "next/server";

import { handleMcpRequest } from "@/lib/services/mcp-transport";
import { authorizeServiceRequest } from "@/lib/services/service-auth";

/**
 * MCP endpoint for Pega's "Connect MCP" rule to call.
 *
 * Same authorization as the REST tool endpoints (`x-service-api-key`) and the
 * same tool allowlist — this is a protocol adapter over
 * `lib/services/registry.ts`, not a second set of capabilities.
 */

const SESSION_ID_HEADER = "Mcp-Session-Id";

export async function POST(request: Request) {
  const auth = authorizeServiceRequest(request);

  if (!auth.authorized) {
    return NextResponse.json({ message: "Unauthorised." }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const { body: rpcResponse, sessionId } = await handleMcpRequest(
    body,
    request.headers.get(SESSION_ID_HEADER) ?? undefined,
  );

  return NextResponse.json(rpcResponse, {
    headers: {
      "Cache-Control": "no-store",
      [SESSION_ID_HEADER]: sessionId,
    },
  });
}
