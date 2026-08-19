import { NextResponse } from "next/server";

import { handleA2AMessageSend, type A2ASendParams } from "@/lib/assistant/a2a-server";
import { authorizeServiceRequest } from "@/lib/services/service-auth";

/**
 * A2A RPC endpoint for Pega's "Connect Agent" rule to call.
 *
 * Same shared-secret authorization as the tool services and the MCP
 * endpoint — this surface is never reachable from the customer browser.
 */
export async function POST(request: Request) {
  const auth = authorizeServiceRequest(request);

  if (!auth.authorized) {
    return NextResponse.json({ message: "Unauthorised." }, { status: 401 });
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
