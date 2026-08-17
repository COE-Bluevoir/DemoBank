import type { z } from "zod";

import type { PegaConnectionConfig } from "@/lib/config/env";
import { PegaIntegrationError, failureKindForStatus } from "@/lib/pega/errors";
import { PegaTokenProvider, getTokenProvider } from "@/lib/pega/token-provider";

/**
 * Thin HTTP client for the Pega application API.
 *
 * Responsibilities:
 *  - attach the bearer token and refresh it once on a 401
 *  - propagate the correlation ID so a request can be traced end to end
 *  - propagate an idempotency key so retries never duplicate downstream work
 *  - bound every call with a timeout and retry only genuinely transient errors
 *  - validate the response against a schema before it reaches the mapper
 */

const RETRY_BASE_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 4_000;

export interface PegaRequestOptions<TSchema extends z.ZodType> {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  schema: TSchema;
  body?: unknown;
  correlationId?: string;
  idempotencyKey?: string;
  /** Pega's optimistic-concurrency token for the case being updated. */
  eTag?: string;
  query?: Record<string, string | undefined>;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | undefined>,
): string {
  const url = new URL(
    `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`,
  );

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

function backoffDelay(attempt: number): number {
  // Exponential backoff with jitter to avoid synchronised retry storms.
  const exponential = Math.min(
    RETRY_BASE_DELAY_MS * 2 ** attempt,
    MAX_RETRY_DELAY_MS,
  );

  return exponential / 2 + Math.random() * (exponential / 2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A validated response together with the metadata the caller may need. */
export interface PegaResponse<T> {
  data: T;
  /** Pega's optimistic-concurrency token, taken from the `etag` header. */
  eTag?: string;
}

export class PegaHttpClient {
  constructor(
    private readonly config: PegaConnectionConfig,
    private readonly tokenProvider: PegaTokenProvider = getTokenProvider(config),
  ) {}

  /** Convenience wrapper for callers that only need the body. */
  async request<TSchema extends z.ZodType>(
    options: PegaRequestOptions<TSchema>,
  ): Promise<z.infer<TSchema>> {
    return (await this.requestWithMeta(options)).data;
  }

  async requestWithMeta<TSchema extends z.ZodType>(
    options: PegaRequestOptions<TSchema>,
  ): Promise<PegaResponse<z.infer<TSchema>>> {
    const url = buildUrl(this.config.baseUrl, options.path, options.query);
    let lastError: PegaIntegrationError | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        return await this.attempt(url, options);
      } catch (error) {
        if (!(error instanceof PegaIntegrationError) || !error.retryable) {
          throw error;
        }

        lastError = error;

        if (attempt < this.config.maxRetries) {
          await sleep(backoffDelay(attempt));
        }
      }
    }

    throw (
      lastError ??
      new PegaIntegrationError("UNKNOWN", {
        technicalDetail: `Exhausted retries for ${options.method} ${options.path}.`,
        correlationId: options.correlationId,
      })
    );
  }

  /**
   * Upload a file to Pega's attachment store.
   *
   * Multipart, so the JSON request path does not apply: the body is a
   * `FormData` and the `Content-Type` boundary must be set by `fetch` itself.
   * Not retried — a repeated upload would create a second orphan attachment.
   */
  async uploadFile<TSchema extends z.ZodType>(options: {
    path: string;
    fileName: string;
    contentType: string;
    content: Uint8Array;
    schema: TSchema;
    correlationId?: string;
  }): Promise<z.infer<TSchema>> {
    const url = buildUrl(this.config.baseUrl, options.path);
    const form = new FormData();

    form.append(
      "arrayOfFiles",
      new Blob([options.content as BlobPart], { type: options.contentType }),
      options.fileName,
    );

    if (options.path.includes("/cases/")) {
      form.append(
        "file",
        new Blob([options.content as BlobPart], { type: options.contentType }),
        options.fileName,
      );
      form.append("category", "File");
      form.append("type", "File");
    }

    const headers = new Headers({
      Authorization: `Bearer ${await this.tokenProvider.getAccessToken()}`,
      Accept: "application/json",
    });

    if (options.correlationId) {
      headers.set("x-correlation-id", options.correlationId);
    }

    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: form,
        cache: "no-store",
        signal: AbortSignal.timeout(this.config.uploadTimeoutMs),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");

      throw new PegaIntegrationError(timedOut ? "TIMEOUT" : "UNAVAILABLE", {
        technicalDetail: `Attachment upload to ${options.path} failed.`,
        correlationId: options.correlationId,
        cause: error,
      });
    }

    if (!response.ok) {
      throw new PegaIntegrationError(failureKindForStatus(response.status), {
        // The file name is safe to log; the content never is.
        technicalDetail: `Attachment upload returned HTTP ${response.status}.`,
        correlationId: options.correlationId,
      });
    }

    const raw = await response.text();
    const parsed = options.schema.safeParse(
      raw.trim().length > 0 ? JSON.parse(raw) : undefined,
    );

    if (!parsed.success) {
      throw new PegaIntegrationError("CONTRACT", {
        technicalDetail: "Attachment upload returned an unexpected payload.",
        correlationId: options.correlationId,
      });
    }

    return parsed.data;
  }

  private async attempt<TSchema extends z.ZodType>(
    url: string,
    options: PegaRequestOptions<TSchema>,
  ): Promise<PegaResponse<z.infer<TSchema>>> {
    const response = await this.send(url, options, false);

    // A 401 after a previously valid token usually means expiry; retry once
    // with a fresh token before surfacing an auth failure.
    const effective =
      response.status === 401
        ? await this.send(url, options, true)
        : response;

    if (!effective.ok) {
      // Capture Pega's own explanation for the server-side log. It is
      // internal-only diagnostics and never reaches the customer, but without
      // it a rejected submission is impossible to diagnose.
      const detail = await effective.text().catch(() => "");

      throw new PegaIntegrationError(failureKindForStatus(effective.status), {
        technicalDetail: `${options.method} ${options.path} returned HTTP ${effective.status}. ${detail.slice(0, 600)}`,
        correlationId: options.correlationId,
      });
    }

    const eTag = effective.headers.get("etag") ?? undefined;

    // Several Pega endpoints answer a successful write with 201/204 and no
    // body at all, so the body is read as text first and only parsed when
    // there is something to parse.
    const raw = await effective.text();
    let payload: unknown;

    if (raw.trim().length > 0) {
      try {
        payload = JSON.parse(raw);
      } catch (error) {
        throw new PegaIntegrationError("CONTRACT", {
          technicalDetail: `${options.method} ${options.path} returned a non-JSON body.`,
          correlationId: options.correlationId,
          cause: error,
        });
      }
    }

    const parsed = options.schema.safeParse(payload);

    if (!parsed.success) {
      // Never trust the upstream shape: a contract drift is an integration
      // failure, not something the mapper should try to interpret.
      throw new PegaIntegrationError("CONTRACT", {
        technicalDetail: `${options.method} ${options.path} returned an unexpected payload: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
        correlationId: options.correlationId,
      });
    }

    return { data: parsed.data, eTag };
  }

  private async send<TSchema extends z.ZodType>(
    url: string,
    options: PegaRequestOptions<TSchema>,
    refreshToken: boolean,
  ): Promise<Response> {
    if (refreshToken) {
      this.tokenProvider.invalidate();
    }

    const token = await this.tokenProvider.getAccessToken();
    const headers = new Headers({
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    });

    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    if (options.correlationId) {
      headers.set("x-correlation-id", options.correlationId);
    }

    if (options.idempotencyKey) {
      headers.set("x-idempotency-key", options.idempotencyKey);
    }

    if (options.eTag) {
      headers.set("If-Match", options.eTag);
    }

    try {
      return await fetch(url, {
        method: options.method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        // Orchestration state is never cacheable.
        cache: "no-store",
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");

      throw new PegaIntegrationError(timedOut ? "TIMEOUT" : "UNAVAILABLE", {
        technicalDetail: `${options.method} ${options.path} could not reach Pega.`,
        correlationId: options.correlationId,
        cause: error,
      });
    }
  }
}
