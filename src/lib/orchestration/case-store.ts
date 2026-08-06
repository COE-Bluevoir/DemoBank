import fs from "node:fs/promises";
import path from "node:path";

import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { getDynamoClient, requireAwsConfig } from "@/lib/aws/clients";
import { getServerConfig } from "@/lib/config/env";
import type { PolicyException } from "@/lib/orchestration/policy";
import type { IndustryId } from "@/lib/industry/types";
import type {
  ApplicantView,
  ConsentView,
  DemoExecutionEvent,
  DocumentView,
  OnboardingStatus,
  ScenarioId,
} from "@/lib/onboarding/types";

/**
 * Case state for the non-Pega orchestration.
 *
 * When Pega is not in the picture this is the system of record: the case, its
 * lifecycle, its exceptions and its audit trail all live here. Nothing about
 * it is derived from Pega, and Pega is never called.
 */

export interface NonPegaCase {
  caseId: string;
  correlationId: string;
  industryId: IndustryId;
  scenarioId: ScenarioId;
  status: OnboardingStatus;
  version: number;
  createdAt: string;
  lastUpdatedAt: string;

  applicant?: ApplicantView;
  consent?: ConsentView;
  documents: DocumentView[];

  /** Raised by the policy engine, cleared by a reviewer. */
  exceptions: PolicyException[];
  requiresHumanReview: boolean;
  reviewClearedAt?: string;
  reviewedBy?: string;

  /** Screening evidence, retained for audit. */
  screeningResults: Array<{ check: string; outcome: string; detail?: string }>;

  outcome?: {
    customerReference: string;
    accountReference: string;
    productName: string;
  };

  events: DemoExecutionEvent[];
}

export interface NonPegaCaseStore {
  get(caseId: string): Promise<NonPegaCase | undefined>;
  put(record: NonPegaCase): Promise<void>;
}

const TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * File-backed store for local development.
 *
 * In-memory state does not survive Next's per-route module instances, so a
 * case created by one handler is invisible to the next. Disk is the local
 * equivalent of the DynamoDB store used when deployed.
 */
export class FileNonPegaCaseStore implements NonPegaCaseStore {
  constructor(
    private readonly directory = path.join(
      process.cwd(),
      ".demo-data",
      "non-pega",
    ),
  ) {}

  private file(caseId: string): string {
    // Case IDs are generated here, but never trust one as a path component.
    if (!/^[A-Za-z0-9._-]+$/.test(caseId)) {
      throw new Error("Invalid case id.");
    }

    return path.join(this.directory, `${caseId}.json`);
  }

  async get(caseId: string): Promise<NonPegaCase | undefined> {
    try {
      return JSON.parse(
        await fs.readFile(this.file(caseId), "utf8"),
      ) as NonPegaCase;
    } catch {
      return undefined;
    }
  }

  async put(record: NonPegaCase): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });

    // Write then rename, because a plain write is not atomic: a reader that
    // arrives mid-write sees a truncated file and fails to parse it. The
    // journey polls while it runs, so that race happens in practice.
    const target = this.file(record.caseId);
    const temporary = `${target}.${process.pid}.tmp`;

    await fs.writeFile(temporary, JSON.stringify(record, null, 2), "utf8");
    await fs.rename(temporary, target);
  }
}

/** In-process store, used by tests. */
export class InMemoryNonPegaCaseStore implements NonPegaCaseStore {
  private readonly cases = new Map<string, NonPegaCase>();

  async get(caseId: string): Promise<NonPegaCase | undefined> {
    const record = this.cases.get(caseId);
    // Copy so callers cannot mutate stored state in place.
    return record ? structuredClone(record) : undefined;
  }

  async put(record: NonPegaCase): Promise<void> {
    this.cases.set(record.caseId, structuredClone(record));
  }
}

/** DynamoDB store, used wherever requests may reach different instances. */
export class DynamoNonPegaCaseStore implements NonPegaCaseStore {
  private key(caseId: string) {
    return { pk: `NONPEGA_CASE#${caseId}`, sk: "CASE" };
  }

  async get(caseId: string): Promise<NonPegaCase | undefined> {
    const result = await getDynamoClient().send(
      new GetCommand({
        TableName: requireAwsConfig().tableName,
        Key: this.key(caseId),
        // A journey step must never read a stale copy of its own case.
        ConsistentRead: true,
      }),
    );

    return (result.Item?.record as NonPegaCase | undefined) ?? undefined;
  }

  async put(record: NonPegaCase): Promise<void> {
    await getDynamoClient().send(
      new PutCommand({
        TableName: requireAwsConfig().tableName,
        Item: {
          ...this.key(record.caseId),
          record,
          ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
        },
      }),
    );
  }
}

let store: NonPegaCaseStore | undefined;

export function getNonPegaCaseStore(): NonPegaCaseStore {
  if (!store) {
    store =
      getServerConfig().storageDriver === "aws"
        ? new DynamoNonPegaCaseStore()
        : new FileNonPegaCaseStore();
  }

  return store;
}

/** Test seam. */
export function setNonPegaCaseStore(next: NonPegaCaseStore | undefined): void {
  store = next;
}
