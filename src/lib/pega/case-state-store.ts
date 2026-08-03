import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { getDynamoClient, requireAwsConfig } from "@/lib/aws/clients";
import { getServerConfig } from "@/lib/config/env";
import type { ScenarioId } from "@/lib/onboarding/types";

/**
 * Per-case integration state for the live Pega adapter.
 *
 * Pega's DX API has no `caseVersion`, no correlation ID of its own, and
 * sequences its flow actions differently from the order the website presents
 * steps in. The values that bridge those gaps live here.
 *
 * This must be durable: on serverless hosting each request may hit a different
 * instance, and losing this mid-journey would make the website re-ask for
 * details the customer already gave, or submit consent it never captured.
 */

export interface PegaCaseState {
  scenarioId: ScenarioId;
  correlationId: string;
  version: number;
  eTag?: string;
  lastUpdateTime?: string;
  /** Everything the customer has provided so far in this application. */
  collected: Record<string, unknown>;
}

export interface PegaCaseStateStore {
  get(caseId: string): Promise<PegaCaseState | undefined>;
  put(caseId: string, state: PegaCaseState): Promise<void>;
  clear(): Promise<void>;
}

/** Retain case state for 30 days, well beyond any onboarding journey. */
const TTL_SECONDS = 30 * 24 * 60 * 60;

/** In-process store. Correct for local development and for tests. */
export class InMemoryPegaCaseStateStore implements PegaCaseStateStore {
  private readonly states = new Map<string, PegaCaseState>();

  async get(caseId: string): Promise<PegaCaseState | undefined> {
    return this.states.get(caseId);
  }

  async put(caseId: string, state: PegaCaseState): Promise<void> {
    this.states.set(caseId, state);
  }

  async clear(): Promise<void> {
    this.states.clear();
  }
}

/**
 * DynamoDB-backed store, used wherever requests are not guaranteed to reach
 * the same instance.
 */
export class DynamoPegaCaseStateStore implements PegaCaseStateStore {
  private key(caseId: string) {
    return { pk: `PEGA_CASE_STATE#${caseId}` };
  }

  async get(caseId: string): Promise<PegaCaseState | undefined> {
    const { tableName } = requireAwsConfig();

    const result = await getDynamoClient().send(
      new GetCommand({
        TableName: tableName,
        Key: this.key(caseId),
        // A journey step must never read a stale copy of what the customer
        // just submitted.
        ConsistentRead: true,
      }),
    );

    return (result.Item?.state as PegaCaseState | undefined) ?? undefined;
  }

  async put(caseId: string, state: PegaCaseState): Promise<void> {
    const { tableName } = requireAwsConfig();

    await getDynamoClient().send(
      new PutCommand({
        TableName: tableName,
        Item: {
          ...this.key(caseId),
          state,
          ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
        },
      }),
    );
  }

  async clear(): Promise<void> {
    // Bulk deletion is intentionally unsupported: entries expire via TTL, and
    // a scan-and-delete against a live table is not something to expose.
  }
}

/** Remove a single case's state. Used by tests and demo reset. */
export async function deleteCaseState(caseId: string): Promise<void> {
  if (getServerConfig().storageDriver !== "aws") {
    return;
  }

  await getDynamoClient().send(
    new DeleteCommand({
      TableName: requireAwsConfig().tableName,
      Key: { pk: `PEGA_CASE_STATE#${caseId}` },
    }),
  );
}

let store: PegaCaseStateStore | undefined;

export function getPegaCaseStateStore(): PegaCaseStateStore {
  if (!store) {
    store =
      getServerConfig().storageDriver === "aws"
        ? new DynamoPegaCaseStateStore()
        : new InMemoryPegaCaseStateStore();
  }

  return store;
}

/** Test seam: install a specific store implementation. */
export function setPegaCaseStateStore(next: PegaCaseStateStore | undefined): void {
  store = next;
}
