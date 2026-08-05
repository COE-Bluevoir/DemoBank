import { createHash } from "node:crypto";

import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { getDynamoClient, requireAwsConfig } from "@/lib/aws/clients";
import { getServerConfig } from "@/lib/config/env";

/**
 * Idempotency for downstream tool invocations.
 *
 * Pega must be able to retry a tool call after a timeout without causing a
 * second side effect. A repeated call with the same idempotency key returns
 * the stored response verbatim.
 *
 * The store is in-memory, which suits a single-instance demo deployment. A
 * multi-instance deployment should back this with Redis or a database table;
 * only this module would change.
 */

interface StoredResult {
  /** Fingerprint of the request body, to detect key reuse with new content. */
  requestFingerprint: string;
  result: unknown;
  storedAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000;

const store = new Map<string, StoredResult>();

export class IdempotencyConflictError extends Error {
  constructor() {
    super(
      "This idempotency key was already used with a different request payload.",
    );
    this.name = "IdempotencyConflictError";
  }
}

function fingerprint(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload ?? null))
    .digest("hex");
}

function purgeExpired(now: number): void {
  for (const [key, value] of store) {
    if (now - value.storedAt > TTL_MS) {
      store.delete(key);
    }
  }
}

export interface IdempotentOutcome<T> {
  result: T;
  replayed: boolean;
}

/**
 * Run `operation` at most once per `(toolName, key)` pair.
 *
 * Without a key the operation simply runs — callers that need retry safety
 * are expected to supply one.
 */
export async function runIdempotent<T>(
  toolName: string,
  key: string | undefined,
  request: unknown,
  operation: () => Promise<T> | T,
): Promise<IdempotentOutcome<T>> {
  if (!key) {
    return { result: await operation(), replayed: false };
  }

  const scopedKey = `${toolName}:${key}`;
  const requestFingerprint = fingerprint(request);

  // On serverless hosting no memory is shared between requests, so a retry
  // would re-run the operation and open a second account. DynamoDB gives the
  // record a home that outlives the instance.
  if (getServerConfig().storageDriver === "aws") {
    const existing = await readDynamoRecord(scopedKey);

    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        throw new IdempotencyConflictError();
      }

      return { result: existing.result as T, replayed: true };
    }

    const result = await operation();
    await writeDynamoRecord(scopedKey, { requestFingerprint, result });

    return { result, replayed: false };
  }

  const now = Date.now();
  purgeExpired(now);

  const existing = store.get(scopedKey);

  if (existing) {
    if (existing.requestFingerprint !== requestFingerprint) {
      throw new IdempotencyConflictError();
    }

    return { result: existing.result as T, replayed: true };
  }

  const result = await operation();
  store.set(scopedKey, { requestFingerprint, result, storedAt: now });

  return { result, replayed: false };
}

async function readDynamoRecord(
  scopedKey: string,
): Promise<{ requestFingerprint: string; result: unknown } | undefined> {
  const { tableName } = requireAwsConfig();

  const response = await getDynamoClient().send(
    new GetCommand({
      TableName: tableName,
      // Constant sort key: the table is keyed pk+sk for the ledger's benefit.
      Key: { pk: `IDEMPOTENCY#${scopedKey}`, sk: "RECORD" },
      // A retry must observe the original result, never a stale miss.
      ConsistentRead: true,
    }),
  );

  if (!response.Item) {
    return undefined;
  }

  return {
    requestFingerprint: String(response.Item.requestFingerprint),
    result: response.Item.result,
  };
}

async function writeDynamoRecord(
  scopedKey: string,
  record: { requestFingerprint: string; result: unknown },
): Promise<void> {
  await getDynamoClient().send(
    new PutCommand({
      TableName: requireAwsConfig().tableName,
      Item: {
        pk: `IDEMPOTENCY#${scopedKey}`,
        sk: "RECORD",
        requestFingerprint: record.requestFingerprint,
        result: record.result,
        ttl: Math.floor((Date.now() + TTL_MS) / 1000),
      },
    }),
  );
}

/** Test seam: empty the idempotency store. */
export function resetIdempotencyStore(): void {
  store.clear();
}
