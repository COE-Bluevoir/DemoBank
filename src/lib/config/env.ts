import { z } from "zod";

/**
 * Server-side configuration boundary.
 *
 * Every value the application reads from the environment is validated here so
 * that a misconfigured deployment fails at startup with an actionable message
 * rather than at the first customer request.
 *
 * Nothing in this module may be imported from a client component: Pega
 * credentials must never reach the browser bundle. The guard below turns an
 * accidental client import into an immediate, obvious failure.
 */
if (typeof window !== "undefined") {
  throw new Error(
    "src/lib/config/env.ts is server-only and must not be imported from a client component.",
  );
}

const DEFAULT_PEGA_TIMEOUT_MS = 12_000;
const DEFAULT_PEGA_RETRIES = 2;
const DEFAULT_TOKEN_SKEW_SECONDS = 60;

const booleanFromString = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value === "") {
        return defaultValue;
      }

      return value.toLowerCase() === "true" || value === "1";
    });

const integerFromString = (defaultValue: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === "") {
        return defaultValue;
      }

      const parsed = Number(value);

      if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        ctx.addIssue({
          code: "custom",
          message: `Expected an integer between ${min} and ${max}.`,
        });
        return z.NEVER;
      }

      return parsed;
    });

const envSchema = z.object({
  ORCHESTRATION_MODE: z
    .enum(["mock-pega", "pega", "non-pega"])
    .optional()
    .default("mock-pega"),
  DEMO_SCENARIO: z
    .enum(["ADDRESS_PEP_REVIEW", "HAPPY_PATH", "SERVICE_TIMEOUT"])
    .optional()
    .default("ADDRESS_PEP_REVIEW"),
  DEMO_CONTROL_ENABLED: booleanFromString(true),
  DEMO_CONTROL_PASSCODE: z.string().min(1).optional().default("northstar-26"),

  PEGA_BASE_URL: z.url().optional(),
  PEGA_TOKEN_URL: z.url().optional(),
  PEGA_CLIENT_ID: z.string().min(1).optional(),
  PEGA_CLIENT_SECRET: z.string().min(1).optional(),
  PEGA_CASE_TYPE_ID: z.string().min(1).optional().default("ODHMNT-AgenticC-Work-CustomerOnboardingUnified"),
  PEGA_TIMEOUT_MS: integerFromString(DEFAULT_PEGA_TIMEOUT_MS, 1_000, 60_000),
  PEGA_MAX_RETRIES: integerFromString(DEFAULT_PEGA_RETRIES, 0, 5),
  PEGA_TOKEN_SKEW_SECONDS: integerFromString(DEFAULT_TOKEN_SKEW_SECONDS, 0, 600),

  SERVICE_API_KEY: z.string().min(1).optional(),
  DOCUMENT_STORAGE_DIR: z.string().min(1).optional(),

  /**
   * Where durable state lives.
   *
   * `file` keeps everything on local disk, which suits local development.
   * `aws` uses DynamoDB and S3, which is required on serverless hosting where
   * the filesystem is read-only and no memory is shared between requests.
   */
  STORAGE_DRIVER: z.enum(["file", "aws"]).optional().default("file"),

  /**
   * Which agent implementation answers customer messages.
   *
   * `deterministic` needs no AWS access and keeps the journey demonstrable;
   * `bedrock` uses real inference. The contracts are identical either way.
   */
  AGENT_PROVIDER: z.enum(["deterministic", "bedrock"]).optional().default("deterministic"),
  BEDROCK_REGION: z.string().min(1).optional(),
  /** Routing and classification. Cheap model, high call volume. */
  BEDROCK_MODEL_ID: z.string().min(1).optional().default("amazon.nova-2-lite-v1:0"),
  /** Reasoning and extraction. Stronger model, lower call volume. */
  BEDROCK_REASONING_MODEL_ID: z.string().min(1).optional().default("amazon.nova-pro-v1:0"),
  AWS_REGION: z.string().min(1).optional(),
  DYNAMODB_TABLE_NAME: z.string().min(1).optional(),
  S3_DOCUMENT_BUCKET: z.string().min(1).optional(),
});

export type RawServerEnv = z.infer<typeof envSchema>;

/** Any environment-shaped bag of strings, including process.env. */
export type EnvSource = Record<string, string | undefined>;

export interface PegaConnectionConfig {
  baseUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  caseTypeId: string;
  timeoutMs: number;
  maxRetries: number;
  tokenSkewSeconds: number;
}

export interface AwsStorageConfig {
  region: string;
  tableName: string;
  documentBucket: string;
}

export interface AgentConfig {
  provider: "deterministic" | "bedrock";
  region: string;
  modelId: string;
  reasoningModelId: string;
}

export interface ServerConfig {
  orchestrationMode: RawServerEnv["ORCHESTRATION_MODE"];
  defaultScenarioId: RawServerEnv["DEMO_SCENARIO"];
  demoControlEnabled: boolean;
  demoControlPasscode: string;
  serviceApiKey?: string;
  documentStorageDir?: string;
  storageDriver: RawServerEnv["STORAGE_DRIVER"];
  agents: AgentConfig;
  /** Present only when the AWS driver is selected and fully configured. */
  aws?: AwsStorageConfig;
  /** Present only when every required Pega variable is configured. */
  pega?: PegaConnectionConfig;
  /** Human-readable reasons the Pega connection is unavailable. */
  pegaConfigurationIssues: string[];
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

const REQUIRED_PEGA_KEYS = [
  "PEGA_BASE_URL",
  "PEGA_TOKEN_URL",
  "PEGA_CLIENT_ID",
  "PEGA_CLIENT_SECRET",
] as const;

function buildPegaConfig(env: RawServerEnv): {
  pega?: PegaConnectionConfig;
  issues: string[];
} {
  const missing = REQUIRED_PEGA_KEYS.filter((key) => !env[key]);

  if (missing.length > 0) {
    return {
      issues: [`Missing required Pega settings: ${missing.join(", ")}.`],
    };
  }

  return {
    issues: [],
    pega: {
      baseUrl: env.PEGA_BASE_URL!.replace(/\/+$/, ""),
      tokenUrl: env.PEGA_TOKEN_URL!,
      clientId: env.PEGA_CLIENT_ID!,
      clientSecret: env.PEGA_CLIENT_SECRET!,
      caseTypeId: env.PEGA_CASE_TYPE_ID,
      timeoutMs: env.PEGA_TIMEOUT_MS,
      maxRetries: env.PEGA_MAX_RETRIES,
      tokenSkewSeconds: env.PEGA_TOKEN_SKEW_SECONDS,
    },
  };
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

function loadConfig(source: EnvSource): ServerConfig {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    throw new ConfigurationError(
      `Invalid server environment configuration. ${formatIssues(parsed.error)}`,
    );
  }

  const env = parsed.data;
  const { pega, issues } = buildPegaConfig(env);

  // Running against real Pega without credentials is never silently tolerated:
  // the operator asked for live orchestration and must be told it cannot start.
  if (env.ORCHESTRATION_MODE === "pega" && !pega) {
    throw new ConfigurationError(
      `ORCHESTRATION_MODE is "pega" but the connection is not configured. ${issues.join(" ")}`,
    );
  }

  // Serverless hosting has no writable filesystem and no shared memory, so a
  // half-configured AWS driver must fail at startup rather than lose a
  // customer's application mid-journey.
  if (env.STORAGE_DRIVER === "aws") {
    // The region is supplied by the Lambda runtime and cannot be set as a
    // build variable, so only the resource names are genuinely required.
    const missing = (
      ["DYNAMODB_TABLE_NAME", "S3_DOCUMENT_BUCKET"] as const
    ).filter((key) => !env[key]);

    if (missing.length > 0) {
      throw new ConfigurationError(
        `STORAGE_DRIVER is "aws" but these settings are missing: ${missing.join(", ")}.`,
      );
    }
  }

  return {
    orchestrationMode: env.ORCHESTRATION_MODE,
    defaultScenarioId: env.DEMO_SCENARIO,
    demoControlEnabled: env.DEMO_CONTROL_ENABLED,
    demoControlPasscode: env.DEMO_CONTROL_PASSCODE,
    serviceApiKey: env.SERVICE_API_KEY,
    documentStorageDir: env.DOCUMENT_STORAGE_DIR,
    storageDriver: env.STORAGE_DRIVER,
    agents: {
      provider: env.AGENT_PROVIDER,
      // Bedrock inherits the general AWS region unless given its own.
      region: env.BEDROCK_REGION ?? env.AWS_REGION ?? "us-east-1",
      modelId: env.BEDROCK_MODEL_ID,
      reasoningModelId: env.BEDROCK_REASONING_MODEL_ID,
    },
    aws:
      env.STORAGE_DRIVER === "aws"
        ? {
            region: env.AWS_REGION ?? env.BEDROCK_REGION ?? "us-east-1",
            tableName: env.DYNAMODB_TABLE_NAME!,
            documentBucket: env.S3_DOCUMENT_BUCKET!,
          }
        : undefined,
    pega,
    pegaConfigurationIssues: issues,
  };
}

let cached: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  if (!cached) {
    cached = loadConfig(process.env);
  }

  return cached;
}

/** Test seam: rebuild the configuration from an explicit environment. */
export function loadServerConfigFrom(source: EnvSource): ServerConfig {
  return loadConfig(source);
}

/** Test seam: drop the memoized configuration. */
export function resetServerConfigCache(): void {
  cached = undefined;
}

export function requirePegaConfig(): PegaConnectionConfig {
  const config = getServerConfig();

  if (!config.pega) {
    throw new ConfigurationError(
      `The Pega connection is not configured. ${config.pegaConfigurationIssues.join(" ")}`,
    );
  }

  return config.pega;
}
