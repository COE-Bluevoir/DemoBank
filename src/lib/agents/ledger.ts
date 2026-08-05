import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

import type { AgentDecisionRecord } from "@/lib/agents/contracts";
import { getDynamoClient, requireAwsConfig } from "@/lib/aws/clients";
import { getServerConfig } from "@/lib/config/env";

/**
 * The AI action ledger.
 *
 * Every agent decision is written here before its result is used, so any
 * answer a customer received can be traced back to the model, prompt version
 * and configuration that produced it. Without this the agent layer is a black
 * box, which is precisely what governed execution is meant to avoid.
 */

export interface AgentLedger {
  append(records: AgentDecisionRecord[]): Promise<void>;
  /** Most recent first. */
  recent(limit?: number): Promise<AgentDecisionRecord[]>;
  byCorrelationId(correlationId: string): Promise<AgentDecisionRecord[]>;
}

const DEFAULT_LIMIT = 100;
/** Ledger entries expire after 30 days, well beyond any onboarding journey. */
const TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * In-process ledger.
 *
 * Bounded so a long-running demo cannot exhaust memory.
 */
export class InMemoryAgentLedger implements AgentLedger {
  private readonly entries: AgentDecisionRecord[] = [];

  constructor(private readonly capacity = 500) {}

  async append(records: AgentDecisionRecord[]): Promise<void> {
    this.entries.push(...records);

    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }
  }

  async recent(limit = DEFAULT_LIMIT): Promise<AgentDecisionRecord[]> {
    return [...this.entries].reverse().slice(0, limit);
  }

  async byCorrelationId(correlationId: string): Promise<AgentDecisionRecord[]> {
    return this.entries.filter(
      (entry) => entry.correlationId === correlationId,
    );
  }
}

/**
 * DynamoDB ledger.
 *
 * Partitioned by correlation ID so a whole interaction can be retrieved
 * together, which is how it is read during a review.
 */
export class DynamoAgentLedger implements AgentLedger {
  async append(records: AgentDecisionRecord[]): Promise<void> {
    const { tableName } = requireAwsConfig();
    const client = getDynamoClient();

    await Promise.all(
      records.map((entry, index) =>
        client.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              pk: `AGENT_LEDGER#${entry.correlationId}`,
              // Timestamp plus index keeps records from the same millisecond
              // distinct and ordered.
              sk: `${entry.timestamp}#${index}`,
              ...entry,
              ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
            },
          }),
        ),
      ),
    );
  }

  async recent(): Promise<AgentDecisionRecord[]> {
    // Deliberately unsupported: a scan across a live table to populate a
    // console is not something to expose. Read by correlation ID instead.
    return [];
  }

  async byCorrelationId(correlationId: string): Promise<AgentDecisionRecord[]> {
    const { tableName } = requireAwsConfig();

    const response = await getDynamoClient().send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": `AGENT_LEDGER#${correlationId}` },
      }),
    );

    return (response.Items ?? []) as AgentDecisionRecord[];
  }
}

let ledger: AgentLedger | undefined;

export function getAgentLedger(): AgentLedger {
  if (!ledger) {
    ledger =
      getServerConfig().storageDriver === "aws"
        ? new DynamoAgentLedger()
        : new InMemoryAgentLedger();
  }

  return ledger;
}

/** Test seam. */
export function setAgentLedger(next: AgentLedger | undefined): void {
  ledger = next;
}
