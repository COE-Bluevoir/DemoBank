import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";

import { type AwsStorageConfig, getServerConfig } from "@/lib/config/env";

/**
 * AWS clients for durable state.
 *
 * Serverless hosting gives each request a read-only filesystem and no shared
 * memory, so anything that must survive between requests lives in DynamoDB or
 * S3. Clients are created once per process and reused across warm invocations.
 *
 * Credentials are never configured here: the runtime's execution role supplies
 * them through the default provider chain.
 */

let documentClient: DynamoDBDocumentClient | undefined;
let s3Client: S3Client | undefined;

export class AwsStorageNotConfiguredError extends Error {
  constructor() {
    super(
      'AWS storage was requested but STORAGE_DRIVER is not "aws". Set AWS_REGION, DYNAMODB_TABLE_NAME and S3_DOCUMENT_BUCKET.',
    );
    this.name = "AwsStorageNotConfiguredError";
  }
}

export function requireAwsConfig(): AwsStorageConfig {
  const { aws } = getServerConfig();

  if (!aws) {
    throw new AwsStorageNotConfiguredError();
  }

  return aws;
}

export function getDynamoClient(): DynamoDBDocumentClient {
  if (!documentClient) {
    documentClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: requireAwsConfig().region }),
      // Undefined values are dropped rather than rejected, so optional case
      // fields do not have to be stripped by every caller.
      { marshallOptions: { removeUndefinedValues: true } },
    );
  }

  return documentClient;
}

export function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: requireAwsConfig().region });
  }

  return s3Client;
}

/** Test seam: drop memoized clients so a new configuration takes effect. */
export function resetAwsClients(): void {
  documentClient = undefined;
  s3Client = undefined;
}
