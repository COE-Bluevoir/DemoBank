import { timingSafeEqual } from "node:crypto";

import { getServerConfig } from "@/lib/config/env";

/**
 * Authentication for inbound calls from the orchestration layer.
 *
 * Pega (or any approved caller) presents a shared secret in `x-service-api-key`
 * when invoking the downstream tool services and the evidence-retrieval
 * endpoint. These surfaces are never reachable from the customer browser.
 */

export const SERVICE_API_KEY_HEADER = "x-service-api-key";
export const CORRELATION_ID_HEADER = "x-correlation-id";
export const IDEMPOTENCY_KEY_HEADER = "x-idempotency-key";

export type ServiceAuthResult =
  | { authorized: true }
  | { authorized: false; reason: string };

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");

  // timingSafeEqual throws on length mismatch, so compare lengths separately.
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

/**
 * Authorize an inbound service request.
 *
 * When `SERVICE_API_KEY` is unset the services stay open, which keeps local
 * development frictionless. Any deployed environment must set the variable.
 */
export function authorizeServiceRequest(request: Request): ServiceAuthResult {
  const expected = getServerConfig().serviceApiKey;

  if (!expected) {
    return { authorized: true };
  }

  const presented = request.headers.get(SERVICE_API_KEY_HEADER);

  if (!presented) {
    return { authorized: false, reason: "Missing service API key." };
  }

  if (!constantTimeEquals(presented, expected)) {
    return { authorized: false, reason: "Invalid service API key." };
  }

  return { authorized: true };
}

/** Correlation ID supplied by the caller, or a generated fallback. */
export function correlationIdFrom(request: Request): string {
  return request.headers.get(CORRELATION_ID_HEADER) || `corr-local-${Date.now()}`;
}

export function idempotencyKeyFrom(request: Request): string | undefined {
  return request.headers.get(IDEMPOTENCY_KEY_HEADER) ?? undefined;
}
