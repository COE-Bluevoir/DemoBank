/**
 * Server-side error logging.
 *
 * The customer receives a neutral message; the operator needs the real cause.
 * This is where that split is recorded, with correlation identifiers so an
 * incident can be traced back to a specific case.
 *
 * Never pass document content, credentials or full request bodies here.
 */

export interface ServerErrorContext {
  scope: string;
  correlationId?: string;
  caseId?: string;
  detail?: string;
}

export function logServerError(
  context: ServerErrorContext,
  error: unknown,
): void {
  const parts = [
    `[${context.scope}]`,
    context.caseId ? `case=${context.caseId}` : undefined,
    context.correlationId ? `correlation=${context.correlationId}` : undefined,
    context.detail,
  ].filter(Boolean);

  // console.error is the transport here; swap for the platform logger when one
  // is introduced. Errors are reported on stderr, not swallowed.
  console.error(parts.join(" "), error instanceof Error ? error.message : error);
}
