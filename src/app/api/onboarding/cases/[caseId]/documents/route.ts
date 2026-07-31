import { NextResponse } from "next/server";

import { getAdapterForCase } from "@/lib/onboarding/adapters";
import { serializeError } from "@/lib/onboarding/engine";
import {
  documentMetadataSchema,
  validateDocumentFileType,
} from "@/lib/onboarding/schemas";

export async function POST(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  try {
    const { caseId } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");
    const kind = formData.get("kind");

    if (!(file instanceof File) || typeof kind !== "string") {
      return NextResponse.json(
        { message: "Document upload is missing a file or document type." },
        { status: 422 },
      );
    }

    if (!validateDocumentFileType(file.type)) {
      return NextResponse.json(
        { message: "Unsupported file type. Use PDF, JPG or PNG." },
        { status: 422 },
      );
    }

    const payload = documentMetadataSchema.parse({
      kind,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      source: "upload",
    });

    const adapter = getAdapterForCase(caseId);
    const response = await adapter.uploadDocument(caseId, payload);
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const serialized = serializeError(error);
    return NextResponse.json(
      { message: serialized.message },
      { status: serialized.statusCode },
    );
  }
}
