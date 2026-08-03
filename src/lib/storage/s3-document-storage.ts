import { createHash, randomUUID } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { getS3Client, requireAwsConfig } from "@/lib/aws/clients";
import type {
  DocumentStorage,
  StoredDocumentMetadata,
} from "@/lib/storage/document-storage";

/**
 * S3-backed document storage.
 *
 * Uploaded evidence must outlive the request that received it and be readable
 * from any instance, because the orchestration layer fetches it later through
 * the evidence endpoint. A serverless filesystem satisfies neither condition.
 *
 * Metadata travels as S3 object metadata, so a document and its provenance
 * cannot drift apart.
 */
export class S3DocumentStorage implements DocumentStorage {
  private objectKey(storageKey: string): string {
    return `documents/${storageKey}`;
  }

  async put(input: {
    caseId: string;
    kind: "IDENTITY" | "ADDRESS";
    fileName: string;
    fileType: string;
    content: Uint8Array;
  }): Promise<StoredDocumentMetadata> {
    const { documentBucket } = requireAwsConfig();
    const storageKey = `${input.caseId}-${input.kind}-${randomUUID()}`.replace(
      /[^A-Za-z0-9._-]/g,
      "",
    );

    const metadata: StoredDocumentMetadata = {
      storageKey,
      caseId: input.caseId,
      kind: input.kind,
      fileName: input.fileName,
      fileType: input.fileType,
      fileSize: input.content.byteLength,
      contentHash: createHash("sha256").update(input.content).digest("hex"),
      storedAt: new Date().toISOString(),
    };

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: documentBucket,
        Key: this.objectKey(storageKey),
        Body: input.content,
        ContentType: input.fileType,
        // S3 metadata values must be ASCII, so the original file name is
        // encoded rather than sent raw.
        Metadata: {
          caseid: input.caseId,
          kind: input.kind,
          filename: encodeURIComponent(input.fileName),
          contenthash: metadata.contentHash,
          storedat: metadata.storedAt,
        },
      }),
    );

    return metadata;
  }

  async get(storageKey: string): Promise<{
    metadata: StoredDocumentMetadata;
    content: Uint8Array;
  } | null> {
    // Same guard as the local driver: a malformed key is "not found", never a
    // server error.
    if (!/^[A-Za-z0-9._-]+$/.test(storageKey)) {
      return null;
    }

    try {
      const result = await getS3Client().send(
        new GetObjectCommand({
          Bucket: requireAwsConfig().documentBucket,
          Key: this.objectKey(storageKey),
        }),
      );

      if (!result.Body) {
        return null;
      }

      const content = new Uint8Array(
        await result.Body.transformToByteArray(),
      );
      const stored = result.Metadata ?? {};

      return {
        content,
        metadata: {
          storageKey,
          caseId: stored.caseid ?? "",
          kind: stored.kind === "ADDRESS" ? "ADDRESS" : "IDENTITY",
          fileName: stored.filename
            ? decodeURIComponent(stored.filename)
            : storageKey,
          fileType: result.ContentType ?? "application/octet-stream",
          fileSize: content.byteLength,
          contentHash:
            stored.contenthash ??
            createHash("sha256").update(content).digest("hex"),
          storedAt: stored.storedat ?? new Date().toISOString(),
        },
      };
    } catch {
      // A missing object is an expected outcome, not an incident.
      return null;
    }
  }

  async delete(storageKey: string): Promise<void> {
    if (!/^[A-Za-z0-9._-]+$/.test(storageKey)) {
      return;
    }

    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: requireAwsConfig().documentBucket,
        Key: this.objectKey(storageKey),
      }),
    );
  }
}
