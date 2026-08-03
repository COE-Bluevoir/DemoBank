/**
 * Error translation for the Pega boundary.
 *
 * Pega failures must never reach the customer as raw upstream text: the BFF
 * turns them into neutral, business-safe messages while preserving the
 * technical detail for server-side logs and the presenter timeline.
 */

export type PegaFailureKind =
  | "AUTH"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "CONTRACT"
  | "UNKNOWN";

const CUSTOMER_SAFE_MESSAGE: Record<PegaFailureKind, string> = {
  AUTH: "We could not complete that step right now. Your application has been saved.",
  NOT_FOUND: "We could not find that application.",
  VERSION_CONFLICT:
    "This application changed in another session. Refresh and try again.",
  VALIDATION: "Some of the information provided could not be accepted.",
  RATE_LIMITED:
    "We are handling a high volume of requests. Please try again in a moment.",
  UNAVAILABLE:
    "We could not complete that step right now. Your application has been saved.",
  TIMEOUT:
    "We could not complete that step right now. Your application has been saved.",
  CONTRACT:
    "We could not complete that step right now. Your application has been saved.",
  UNKNOWN:
    "We could not complete that step right now. Your application has been saved.",
};

const HTTP_STATUS: Record<PegaFailureKind, number> = {
  AUTH: 502,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  VALIDATION: 422,
  RATE_LIMITED: 503,
  UNAVAILABLE: 502,
  TIMEOUT: 504,
  CONTRACT: 502,
  UNKNOWN: 502,
};

/** Failure kinds where retrying the same request can reasonably succeed. */
const RETRYABLE: ReadonlySet<PegaFailureKind> = new Set<PegaFailureKind>([
  "RATE_LIMITED",
  "UNAVAILABLE",
  "TIMEOUT",
]);

export class PegaIntegrationError extends Error {
  readonly kind: PegaFailureKind;
  readonly statusCode: number;
  /** Safe to render to a customer. */
  readonly customerMessage: string;
  /** Server-side only. Never returned in an HTTP response body. */
  readonly technicalDetail?: string;
  readonly correlationId?: string;

  constructor(
    kind: PegaFailureKind,
    options: {
      technicalDetail?: string;
      correlationId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(`Pega integration failure (${kind}): ${options.technicalDetail ?? kind}`, {
      cause: options.cause,
    });
    this.name = "PegaIntegrationError";
    this.kind = kind;
    this.statusCode = HTTP_STATUS[kind];
    this.customerMessage = CUSTOMER_SAFE_MESSAGE[kind];
    this.technicalDetail = options.technicalDetail;
    this.correlationId = options.correlationId;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }
}

/** Map an upstream HTTP status onto a failure kind. */
export function failureKindForStatus(status: number): PegaFailureKind {
  if (status === 401 || status === 403) {
    return "AUTH";
  }

  if (status === 404) {
    return "NOT_FOUND";
  }

  if (status === 409 || status === 412) {
    return "VERSION_CONFLICT";
  }

  if (status === 400 || status === 422) {
    return "VALIDATION";
  }

  if (status === 429) {
    return "RATE_LIMITED";
  }

  if (status >= 500) {
    return "UNAVAILABLE";
  }

  return "UNKNOWN";
}

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE.has(failureKindForStatus(status));
}
