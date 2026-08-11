import { NextResponse } from "next/server";

import { getAdapterForCase } from "@/lib/onboarding/adapters";
import { MAX_UPLOAD_BYTES } from "@/lib/onboarding/constants";
import { serializeError } from "@/lib/onboarding/engine";
import { documentMetadataSchema } from "@/lib/onboarding/schemas";
import { getDocumentStorage } from "@/lib/storage/document-storage";
import {
  contentMatchesDeclaredType,
  sniffFileType,
} from "@/lib/storage/file-signature";

/**
 * Document upload endpoint.
 *
 * Uploads are treated as untrusted input:
 *  - the declared size is rejected before the body is buffered
 *  - the real content type is confirmed from magic bytes, not the client claim
 *  - content is written to the storage abstraction and referenced by an opaque
 *    handle; the bytes themselves are never logged or echoed back
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    const { caseId } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");
    const kind = formData.get("kind");
    const documentCode = formData.get("documentCode");

    if (!(file instanceof File) || typeof kind !== "string") {
      return NextResponse.json(
        { message: "Document upload is missing a file or document type." },
        { status: 422 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { message: "The selected file is empty." },
        { status: 422 },
      );
    }

    // Check the declared size before reading the stream into memory.
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { message: "Document too large. Keep each upload under 5 MB." },
        { status: 413 },
      );
    }

    const content = new Uint8Array(await file.arrayBuffer());

    // Guard against an understated declared size.
    if (content.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { message: "Document too large. Keep each upload under 5 MB." },
        { status: 413 },
      );
    }

    const sniffedType = sniffFileType(content);

    if (!sniffedType) {
      return NextResponse.json(
        { message: "Unsupported file type. Use PDF, JPG or PNG." },
        { status: 422 },
      );
    }

    if (!contentMatchesDeclaredType(file.type, sniffedType)) {
      return NextResponse.json(
        { message: "The file contents do not match the file type." },
        { status: 422 },
      );
    }

    const payload = documentMetadataSchema.parse({
      kind,
      fileName: file.name,
      // Trust the sniffed type over the client-declared one.
      fileType: sniffedType,
      fileSize: content.byteLength,
      source: "upload",
    });

    const stored = await getDocumentStorage().put({
      caseId,
      kind: payload.kind,
      fileName: payload.fileName,
      fileType: payload.fileType,
      content,
    });

    const adapter = getAdapterForCase(caseId);
    const response = await adapter.uploadDocument(caseId, {
      ...payload,
      // Which requirement this file answers. Absent for callers that predate
      // the industry document profile, which still upload by evidence class.
      documentCode:
        typeof documentCode === "string" && documentCode.length > 0
          ? documentCode
          : undefined,
      storageReference: stored.storageKey,
    });

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(
      { message: serialized.message },
      { status: serialized.statusCode },
    );
  }
}
