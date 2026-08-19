import { z } from "zod";

import { requirePegaConfig } from "@/lib/config/env";
import { PegaHttpClient } from "@/lib/pega/http-client";

/**
 * Live read of Pega's `D_ProductCatalog` Data Page — confirmed live
 * 2026-08-19 via `POST /data_views/D_ProductCatalog` with an empty body.
 * Three rows (EVERYDAY_PLUS, BUSINESS_GROWTH, MERCHANT_COLLECTIONS), each
 * with `ProductCode`, `ProductName` and a semicolon-separated
 * `RequiredDocuments` string. No `InterestRate` field exists on the page at
 * all — not blank, absent — which is itself the fact the governance demo
 * relies on.
 *
 * See docs/pega-hallucination-demo-data-page-handoff.md for how this came
 * to exist and why it's deliberately this small.
 */

const productCatalogRowSchema = z.object({
  ProductCode: z.string(),
  ProductName: z.string(),
  RequiredDocuments: z.string(),
});

const productCatalogResponseSchema = z.object({
  resultCount: z.number(),
  data: z.array(productCatalogRowSchema),
});

export interface ProductCatalogEntry {
  productCode: string;
  productName: string;
  /** Split from Pega's semicolon-separated string, trimmed, empty entries dropped. */
  requiredDocuments: readonly string[];
}

let client: PegaHttpClient | undefined;

function getClient(): PegaHttpClient {
  client ??= new PegaHttpClient(requirePegaConfig());
  return client;
}

/**
 * Fetches the live product catalog from Pega. Never falls back to local
 * data on failure — the caller (the governance demo) claims this answer is
 * grounded on live Pega data, and silently substituting local config on a
 * failed call would make that claim false while still displaying it.
 */
export async function fetchProductCatalog(): Promise<
  readonly ProductCatalogEntry[]
> {
  const response = await getClient().request({
    method: "POST",
    path: "/data_views/D_ProductCatalog",
    schema: productCatalogResponseSchema,
    body: {},
  });

  return response.data.map((row) => ({
    productCode: row.ProductCode,
    productName: row.ProductName,
    requiredDocuments: row.RequiredDocuments.split(";")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  }));
}
