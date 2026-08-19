import { NextResponse } from "next/server";

import { issueAccessToken } from "@/lib/services/oauth";

/**
 * OAuth 2.0 client-credentials token endpoint (RFC 6749 §4.4) for Pega's
 * Connect MCP / Connect Agent authentication profiles.
 *
 * Accepts the client_id/client_secret either as HTTP Basic auth (the spec's
 * preferred form, §2.3.1 — what this app's own `token-provider.ts` sends
 * when authenticating to Pega's token endpoint) or in the form body, since
 * different Pega Auth Profile configurations present it differently.
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let clientId: string | undefined;
  let clientSecret: string | undefined;
  let grantType: string | undefined;

  const basicMatch = /^Basic\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  if (basicMatch) {
    const decoded = Buffer.from(basicMatch[1], "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex !== -1) {
      clientId = decoded.slice(0, separatorIndex);
      clientSecret = decoded.slice(separatorIndex + 1);
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(await request.text());
    grantType = form.get("grant_type") ?? undefined;
    clientId = clientId ?? form.get("client_id") ?? undefined;
    clientSecret = clientSecret ?? form.get("client_secret") ?? undefined;
  } else if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    grantType = body.grant_type;
    clientId = clientId ?? body.client_id;
    clientSecret = clientSecret ?? body.client_secret;
  } else {
    // Some connectors omit Content-Type on a form-encoded body.
    const form = new URLSearchParams(await request.text().catch(() => ""));
    grantType = grantType ?? form.get("grant_type") ?? undefined;
    clientId = clientId ?? form.get("client_id") ?? undefined;
    clientSecret = clientSecret ?? form.get("client_secret") ?? undefined;
  }

  if (grantType && grantType !== "client_credentials") {
    return NextResponse.json(
      { error: "unsupported_grant_type" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "client_id and client_secret are required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const token = issueAccessToken(clientId, clientSecret);

  if (!token) {
    return NextResponse.json(
      { error: "invalid_client" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(token, { headers: { "Cache-Control": "no-store" } });
}
