import { NextResponse } from "next/server";

import { handleA2AMessageSend, type A2ASendParams } from "@/lib/assistant/a2a-server";
import { authorizeBearerRequest } from "@/lib/services/oauth";

/**
 * A2A RPC endpoint for Pega's "Connect Agent" rule to call.
 *
 * OAuth 2.0 client-credentials, same token issued by `/api/oauth2/token`
 * and same signing key as `/api/mcp` — one client authorized for both
 * connectors, since both are the same caller (Pega) reaching the same
 * server. Never reachable from the customer browser.
 */
export async function POST(request: Request) {
  if (!authorizeBearerRequest(request)) {
    return NextResponse.json(
      { message: "Unauthorised." },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  let body: { id?: string | number | null; method?: string; params?: A2ASendParams };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const id = body?.id ?? null;

  if (body?.method !== "message/send") {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: "${body?.method}".` },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const { status, body: rpcResponse } = await handleA2AMessageSend(id, body.params);

  return NextResponse.json(rpcResponse, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
