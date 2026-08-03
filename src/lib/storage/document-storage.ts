import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { getServerConfig } from "@/lib/config/env";
import { S3DocumentStorage } from "@/lib/storage/s3-document-storage";

/**
 * Storage abstraction for uploaded document binaries.
 *
 * The local implementation writes to disk, which is appropriate for the demo
 * environment. Swapping in object storage (S3, Azure Blob, Pega attachments)
 * means implementing this interface — no caller changes.
 *
 * Document *content* is never logged, echoed in an error, or returned to the
 * browser. Only opaque references cross module boundaries.
 */

export interface StoredDocumentMetadata {
  storageKey: string;
  caseId: string;
  kind: "IDENTITY" | "ADDRESS";
  fileName: string;
  fileType: string;
  fileSize: number;
  /** SHA-256 of the content, for integrity checks and duplicate detection. */
  contentHash: string;
  storedAt: string;
}

export interface DocumentStorage {
  put(
    input: {
      caseId: string;
      kind: "IDENTITY" | "ADDRESS";
      fileName: string;
      fileType: string;
      content: Uint8Array;
    },
  ): Promise<StoredDocumentMetadata>;
  get(storageKey: string): Promise<{
    metadata: StoredDocumentMetadata;
    content: Uint8Array;
  } | null>;
  delete(storageKey: string): Promise<void>;
}

const DEFAULT_DIR = path.join(process.cwd(), ".demo-data", "documents");

/** Only flat, alphanumeric keys — nothing that could escape the directory. */
function isSafeKey(storageKey: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(storageKey);
}

function assertSafeKey(storageKey: string): void {
  if (!isSafeKey(storageKey)) {
    throw new Error("Invalid storage key.");
  }
}

export class FileSystemDocumentStorage implements DocumentStorage {
  constructor(private readonly baseDir: string = DEFAULT_DIR) {}

  async put(input: {
    caseId: string;
    kind: "IDENTITY" | "ADDRESS";
    fileName: string;
    fileType: string;
    content: Uint8Array;
  }): Promise<StoredDocumentMetadata> {
    await fs.mkdir(this.baseDir, { recursive: true });

    const storageKey = `${input.caseId}-${input.kind}-${randomUUID()}`.replace(
      /[^A-Za-z0-9._-]/g,
      "",
    );

    const metadata: StoredDocumentMetadata = {
      storageKey,
      caseId: input.caseId,
      kind: input.kind,
      // The original name is retained for display but never used as a path.
      fileName: input.fileName,
      fileType: input.fileType,
      fileSize: input.content.byteLength,
      contentHash: createHash("sha256").update(input.content).digest("hex"),
      storedAt: new Date().toISOString(),
    };

    await fs.writeFile(this.blobPath(storageKey), input.content);
    await fs.writeFile(
      this.metaPath(storageKey),
      JSON.stringify(metadata, null, 2),
      "utf8",
    );

    return metadata;
  }

  async get(storageKey: string): Promise<{
    metadata: StoredDocumentMetadata;
    content: Uint8Array;
  } | null> {
    // A malformed or traversing key is reported as "not found" rather than
    // raised, so callers surface a 404 instead of a server error.
    if (!isSafeKey(storageKey)) {
      return null;
    }

    try {
      const [rawMetadata, content] = await Promise.all([
        fs.readFile(this.metaPath(storageKey), "utf8"),
        fs.readFile(this.blobPath(storageKey)),
      ]);

      return {
        metadata: JSON.parse(rawMetadata) as StoredDocumentMetadata,
        content: new Uint8Array(content),
      };
    } catch {
      return null;
    }
  }

  async delete(storageKey: string): Promise<void> {
    assertSafeKey(storageKey);

    await Promise.all([
      fs.rm(this.blobPath(storageKey), { force: true }),
      fs.rm(this.metaPath(storageKey), { force: true }),
    ]);
  }

  private blobPath(storageKey: string): string {
    assertSafeKey(storageKey);
    return path.join(this.baseDir, `${storageKey}.bin`);
  }

  private metaPath(storageKey: string): string {
    assertSafeKey(storageKey);
    return path.join(this.baseDir, `${storageKey}.json`);
  }
}

let storage: DocumentStorage | undefined;

export function getDocumentStorage(): DocumentStorage {
  if (!storage) {
    const config = getServerConfig();

    if (config.storageDriver === "aws") {
      storage = new S3DocumentStorage();
    } else {
      storage = new FileSystemDocumentStorage(
        config.documentStorageDir || DEFAULT_DIR,
      );
    }
  }

  return storage;
}

/** Test seam: install a different storage implementation. */
export function setDocumentStorage(next: DocumentStorage | undefined): void {
  storage = next;
}
