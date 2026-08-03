import { NextResponse } from "next/server";

import { authorizeServiceRequest } from "@/lib/services/service-auth";
import { getDocumentStorage } from "@/lib/storage/document-storage";

/**
 * Evidence retrieval for the orchestration layer.
 *
 * Pega calls this endpoint with the `storageReference` it received on the
 * document-upload contract to pull the original binary. This keeps document
 * content off the browser-to-Pega path entirely.
 *
 * Not reachable from the customer journey and never linked from a public page.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ storageKey: string }> },
) {
  const auth = authorizeServiceRequest(request);

  if (!auth.authorized) {
    return NextResponse.json({ message: "Unauthorised." }, { status: 401 });
  }

  const { storageKey } = await context.params;
  const stored = await getDocumentStorage().get(storageKey);

  if (!stored) {
    return NextResponse.json({ message: "Document not found." }, { status: 404 });
  }

  return new NextResponse(stored.content as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": stored.metadata.fileType,
      "Content-Length": String(stored.metadata.fileSize),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(stored.metadata.fileName)}"`,
      "X-Document-Case-Id": stored.metadata.caseId,
      "X-Document-Kind": stored.metadata.kind,
      "X-Document-Sha256": stored.metadata.contentHash,
      "Cache-Control": "no-store",
    },
  });
}

/** Metadata-only probe, useful for integrity checks without transferring bytes. */
export async function HEAD(
  request: Request,
  context: { params: Promise<{ storageKey: string }> },
) {
  const auth = authorizeServiceRequest(request);

  if (!auth.authorized) {
    return new NextResponse(null, { status: 401 });
  }

  const { storageKey } = await context.params;
  const stored = await getDocumentStorage().get(storageKey);

  if (!stored) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      "Content-Type": stored.metadata.fileType,
      "Content-Length": String(stored.metadata.fileSize),
      "X-Document-Sha256": stored.metadata.contentHash,
      "Cache-Control": "no-store",
    },
  });
}
