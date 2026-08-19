import { createHmac, timingSafeEqual } from "node:crypto";

import { getServerConfig } from "@/lib/config/env";

/**
 * OAuth 2.0 client-credentials for `/api/mcp` and `/api/agent`.
 *
 * A small, self-contained authorization server — not a library, because
 * there's exactly one grant type, one client, and no need for anything a
 * hand-rolled HMAC-signed JWT doesn't already cover. Signature verification
 * is self-contained (no session lookup), so it works the same whether or not
 * the hosting compute persists memory between requests — the same
 * consideration that shaped `lib/services/idempotency.ts`'s AWS fallback.
 *
 * `/api/services/*` (the original tool endpoints) keep their existing
 * shared-secret scheme (`x-service-api-key`) — this is additive, scoped to
 * the two connectors Pega's Connect MCP / Connect Agent rules call.
 */

const TOKEN_TTL_SECONDS = 3600;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  signingKey: string;
}

/** Absent unless every OAuth variable is configured — same pattern as `pega`/`aws` in ServerConfig. */
export function getOAuthConfig(): OAuthConfig | undefined {
  const config = getServerConfig();

  if (!config.mcpOAuthClientId || !config.mcpOAuthClientSecret || !config.mcpOAuthSigningKey) {
    return undefined;
  }

  return {
    clientId: config.mcpOAuthClientId,
    clientSecret: config.mcpOAuthClientSecret,
    signingKey: config.mcpOAuthSigningKey,
  };
}

/**
 * Validate `client_id`/`client_secret` (from the token endpoint's Basic auth
 * header, per RFC 6749 §2.3.1) and issue a signed access token.
 */
export function issueAccessToken(
  presentedClientId: string,
  presentedClientSecret: string,
): { access_token: string; token_type: "Bearer"; expires_in: number } | undefined {
  const oauth = getOAuthConfig();

  if (!oauth) {
    return undefined;
  }

  if (
    !constantTimeEquals(presentedClientId, oauth.clientId) ||
    !constantTimeEquals(presentedClientSecret, oauth.clientSecret)
  ) {
    return undefined;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: oauth.clientId,
      iss: "northstar-bank-onboarding",
      aud: "connect-mcp-agent",
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    }),
  );
  const signature = sign(`${header}.${payload}`, oauth.signingKey);

  return {
    access_token: `${header}.${payload}.${signature}`,
    token_type: "Bearer",
    expires_in: TOKEN_TTL_SECONDS,
  };
}

/** Verify a Bearer token's signature, issuer/audience and expiry. */
export function verifyAccessToken(token: string): boolean {
  const oauth = getOAuthConfig();

  if (!oauth) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const [header, payload, signature] = parts;
  const expected = sign(`${header}.${payload}`, oauth.signingKey);

  if (!constantTimeEquals(signature, expected)) {
    return false;
  }

  let claims: { sub?: string; iss?: string; aud?: string; exp?: number };
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);

  return (
    claims.sub === oauth.clientId &&
    claims.iss === "northstar-bank-onboarding" &&
    claims.aud === "connect-mcp-agent" &&
    typeof claims.exp === "number" &&
    claims.exp > now
  );
}

/** Authorize a request bearing `Authorization: Bearer <token>`. */
export function authorizeBearerRequest(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);

  if (!match) {
    return false;
  }

  return verifyAccessToken(match[1]);
}
