import { z } from "zod";

import type { PegaConnectionConfig } from "@/lib/config/env";
import { PegaIntegrationError, failureKindForStatus } from "@/lib/pega/errors";

/**
 * OAuth 2.0 client-credentials token acquisition for the Pega connection.
 *
 * The provider caches the access token until shortly before it expires and
 * de-duplicates concurrent refreshes, so a burst of customer requests produces
 * exactly one token call rather than one per request.
 */

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().positive().optional(),
});

interface CachedToken {
  accessToken: string;
  /** Epoch milliseconds after which the token must not be reused. */
  expiresAt: number;
}

const DEFAULT_LIFETIME_SECONDS = 3600;

export class PegaTokenProvider {
  private cached?: CachedToken;
  private inFlight?: Promise<string>;

  constructor(
    private readonly config: PegaConnectionConfig,
    private readonly now: () => number = Date.now,
  ) {}

  async getAccessToken(): Promise<string> {
    const cached = this.cached;

    if (cached && cached.expiresAt > this.now()) {
      return cached.accessToken;
    }

    // Collapse concurrent refreshes onto a single upstream token request.
    if (!this.inFlight) {
      this.inFlight = this.requestToken().finally(() => {
        this.inFlight = undefined;
      });
    }

    return this.inFlight;
  }

  /** Drop the cached token, forcing the next call to re-authenticate. */
  invalidate(): void {
    this.cached = undefined;
  }

  private async requestToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    let response: Response;

    try {
      response = await fetch(this.config.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");

      throw new PegaIntegrationError(timedOut ? "TIMEOUT" : "UNAVAILABLE", {
        technicalDetail: `Token request to ${this.config.tokenUrl} failed.`,
        cause: error,
      });
    }

    if (!response.ok) {
      // The response body may echo the client secret; it is never captured.
      throw new PegaIntegrationError(failureKindForStatus(response.status), {
        technicalDetail: `Token endpoint returned HTTP ${response.status}.`,
      });
    }

    const parsed = tokenResponseSchema.safeParse(await response.json());

    if (!parsed.success) {
      throw new PegaIntegrationError("CONTRACT", {
        technicalDetail: "Token endpoint returned an unexpected payload shape.",
      });
    }

    const lifetimeSeconds = parsed.data.expires_in ?? DEFAULT_LIFETIME_SECONDS;
    const usableSeconds = Math.max(
      lifetimeSeconds - this.config.tokenSkewSeconds,
      1,
    );

    this.cached = {
      accessToken: parsed.data.access_token,
      expiresAt: this.now() + usableSeconds * 1000,
    };

    return this.cached.accessToken;
  }
}

const providers = new WeakMap<PegaConnectionConfig, PegaTokenProvider>();

/** One provider per configuration object keeps the token cache warm. */
export function getTokenProvider(
  config: PegaConnectionConfig,
): PegaTokenProvider {
  const existing = providers.get(config);

  if (existing) {
    return existing;
  }

  const provider = new PegaTokenProvider(config);
  providers.set(config, provider);
  return provider;
}
