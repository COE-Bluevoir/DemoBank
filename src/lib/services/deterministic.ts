import { createHash } from "node:crypto";

/**
 * Deterministic value derivation for the mock tool services.
 *
 * The same input always yields the same output, so a demo can be rehearsed and
 * replayed exactly, and so tests never depend on randomness.
 */

function digest(seed: string): Buffer {
  return createHash("sha256").update(seed).digest();
}

/** Stable integer in `[0, max)` derived from `seed`. */
export function deterministicInt(seed: string, max: number): number {
  return digest(seed).readUInt32BE(0) % max;
}

/** Stable float in `[min, max]` derived from `seed`, rounded to 2 decimals. */
export function deterministicScore(
  seed: string,
  min: number,
  max: number,
): number {
  const unit = digest(seed).readUInt32BE(0) / 0xffffffff;
  return Math.round((min + unit * (max - min)) * 100) / 100;
}

/** Stable uppercase reference such as `PRV-3F2A19`. */
export function deterministicReference(prefix: string, seed: string): string {
  return `${prefix}-${digest(seed).toString("hex").slice(0, 6).toUpperCase()}`;
}

/** Stable execution identifier for the audit trail. */
export function deterministicExecutionId(
  toolName: string,
  seed: string,
): string {
  return `exec-${digest(`${toolName}:${seed}`).toString("hex").slice(0, 16)}`;
}

/** Case-insensitive, whitespace-insensitive comparison for address lines. */
export function normalizeForComparison(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
