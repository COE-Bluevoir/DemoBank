// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FileSystemDocumentStorage } from "@/lib/storage/document-storage";
import {
  contentMatchesDeclaredType,
  sniffFileType,
} from "@/lib/storage/file-signature";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

describe("file signature detection", () => {
  it("identifies the supported document formats", () => {
    expect(sniffFileType(PDF)).toBe("application/pdf");
    expect(sniffFileType(JPEG)).toBe("image/jpeg");
    expect(sniffFileType(PNG)).toBe("image/png");
  });

  it("rejects content that is not a supported document", () => {
    const executable = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
    const text = new TextEncoder().encode("just some text");

    expect(sniffFileType(executable)).toBeUndefined();
    expect(sniffFileType(text)).toBeUndefined();
  });

  it("catches an executable renamed with a PDF content type", () => {
    const executable = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);

    expect(sniffFileType(executable)).toBeUndefined();
  });

  it("detects a mismatch between declared and actual type", () => {
    expect(contentMatchesDeclaredType("application/pdf", "image/png")).toBe(false);
    expect(contentMatchesDeclaredType("application/pdf", "application/pdf")).toBe(
      true,
    );
  });

  it("accepts the legacy image/jpg spelling for JPEG content", () => {
    expect(contentMatchesDeclaredType("image/jpg", "image/jpeg")).toBe(true);
    expect(contentMatchesDeclaredType("image/jpeg", "image/jpeg")).toBe(true);
  });
});

describe("document storage", () => {
  let baseDir: string;
  let storage: FileSystemDocumentStorage;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-docs-"));
    storage = new FileSystemDocumentStorage(baseDir);
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it("stores content and returns retrievable metadata", async () => {
    const metadata = await storage.put({
      caseId: "ONB-10027",
      kind: "IDENTITY",
      fileName: "identity.pdf",
      fileType: "application/pdf",
      content: PDF,
    });

    expect(metadata.fileSize).toBe(PDF.byteLength);
    expect(metadata.contentHash).toMatch(/^[a-f0-9]{64}$/);

    const stored = await storage.get(metadata.storageKey);
    expect(stored?.content).toEqual(PDF);
    expect(stored?.metadata.fileName).toBe("identity.pdf");
  });

  it("returns null for an unknown key instead of throwing", async () => {
    expect(await storage.get("does-not-exist")).toBeNull();
  });

  it("refuses a traversal attempt in the storage key", async () => {
    expect(await storage.get("../../../etc/passwd")).toBeNull();
  });

  it("issues a distinct key per upload so re-uploads do not collide", async () => {
    const first = await storage.put({
      caseId: "ONB-10027",
      kind: "IDENTITY",
      fileName: "identity.pdf",
      fileType: "application/pdf",
      content: PDF,
    });
    const second = await storage.put({
      caseId: "ONB-10027",
      kind: "IDENTITY",
      fileName: "identity.pdf",
      fileType: "application/pdf",
      content: PDF,
    });

    expect(first.storageKey).not.toBe(second.storageKey);
  });

  it("removes both the content and the metadata on delete", async () => {
    const metadata = await storage.put({
      caseId: "ONB-10027",
      kind: "ADDRESS",
      fileName: "bill.png",
      fileType: "image/png",
      content: PNG,
    });

    await storage.delete(metadata.storageKey);

    expect(await storage.get(metadata.storageKey)).toBeNull();
    expect(fs.readdirSync(baseDir)).toHaveLength(0);
  });
});
