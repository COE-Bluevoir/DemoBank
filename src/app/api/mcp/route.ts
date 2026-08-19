import { NextResponse } from "next/server";

import { handleMcpRequest } from "@/lib/services/mcp-transport";
import { authorizeBearerRequest } from "@/lib/services/oauth";

/**
 * MCP endpoint for Pega's "Connect MCP" rule to call.
 *
 * OAuth 2.0 client-credentials (`Authorization: Bearer <token>`, minted by
 * `/api/oauth2/token`) — deliberately not the shared-secret header the REST
 * tool endpoints use, per Pega's Connect MCP auth profile expecting OAuth.
 * The tool allowlist itself is unchanged: this is a protocol adapter over
 * `lib/services/registry.ts`, not a second set of capabilities.
 */

const SESSION_ID_HEADER = "Mcp-Session-Id";

export async function POST(request: Request) {
  if (!authorizeBearerRequest(request)) {
    return NextResponse.json(
      { message: "Unauthorised." },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
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
