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

const DEFAULT_PEGA_TIMEOUT_MS = 5_000;
const DEFAULT_PEGA_UPLOAD_TIMEOUT_MS = 60_000;
const DEFAULT_PEGA_RETRIES = 1;
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
    .optional(),
  DEMO_SCENARIO: z
    .enum(["ADDRESS_PEP_REVIEW", "HAPPY_PATH", "SERVICE_TIMEOUT"])
    .optional()
    .default("ADDRESS_PEP_REVIEW"),
  DEMO_CONTROL_ENABLED: booleanFromString(true),
  DEMO_CONTROL_PASSCODE: z.string().min(1).optional().default("northstar-26"),
  // Sent to Pega on case creation as `DemoModeEnabled`. Pega's own flows read
  // that property to decide whether to call live GenAI/screening agents or
  // route through the stub bypass — this is only ever a starting value; the
  // presenter panel can flip it per session without a redeploy.
  PEGA_DEMO_MODE_DEFAULT: booleanFromString(false),

  PEGA_BASE_URL: z.url().optional(),
  PEGA_TOKEN_URL: z.url().optional(),
  PEGA_CLIENT_ID: z.string().min(1).optional(),
  PEGA_CLIENT_SECRET: z.string().min(1).optional(),
  PEGA_CASE_TYPE_ID: z.string().min(1).optional().default("ODHMNT-AgenticC-Work-CustomerOnboardingUnified"),
  PEGA_TIMEOUT_MS: integerFromString(DEFAULT_PEGA_TIMEOUT_MS, 1_000, 60_000),
  PEGA_UPLOAD_TIMEOUT_MS: integerFromString(
    DEFAULT_PEGA_UPLOAD_TIMEOUT_MS,
    5_000,
    180_000,
  ),
  PEGA_MAX_RETRIES: integerFromString(DEFAULT_PEGA_RETRIES, 0, 5),
  PEGA_TOKEN_SKEW_SECONDS: integerFromString(DEFAULT_TOKEN_SKEW_SECONDS, 0, 600),

  SERVICE_API_KEY: z.string().min(1).optional(),
  DOCUMENT_STORAGE_DIR: z.string().min(1).optional(),

  /**
   * OAuth 2.0 client-credentials for `/api/mcp` and `/api/agent` — the
   * surfaces Pega's Connect MCP / Connect Agent rules call. Absent unless
   * all three are set, same pattern as the Pega/AWS connection blocks below.
   */
  MCP_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  MCP_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  MCP_OAUTH_SIGNING_KEY: z.string().min(1).optional(),

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
  /**
   * Which system answers the conversational assistant.
   *
   * Separate from the orchestration mode on purpose: answering a question and
   * running the workflow are different responsibilities, and one should not
   * silently change when the other is switched.
   */
  ASSISTANT_PROVIDER: z
    .enum(["onboarding-guide", "pega", "openai"])
    .optional()
    .default("onboarding-guide"),
  /** Pega's conversational endpoint. Required only when Pega answers. */
  PEGA_ASSISTANT_URL: z.string().url().optional(),
  /** Required only when the assistant is answered by OpenAI. */
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).optional().default("gpt-4o-mini"),
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
  /** Multipart `/attachments/upload` can exceed the DX JSON timeout. */
  uploadTimeoutMs: number;
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
  orchestrationMode: NonNullable<RawServerEnv["ORCHESTRATION_MODE"]>;
  defaultScenarioId: RawServerEnv["DEMO_SCENARIO"];
  demoControlEnabled: boolean;
  demoControlPasscode: string;
  pegaDemoModeDefault: boolean;
  assistantProvider: RawServerEnv["ASSISTANT_PROVIDER"];
  pegaAssistantUrl?: string;
  openaiApiKey?: string;
  openaiModel: string;
  serviceApiKey?: string;
  mcpOAuthClientId?: string;
  mcpOAuthClientSecret?: string;
  mcpOAuthSigningKey?: string;
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
      uploadTimeoutMs: env.PEGA_UPLOAD_TIMEOUT_MS,
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
    // Live Pega is the intended path whenever the connection exists. The mock
    // remains available only when it is requested explicitly, or when this
    // environment has no Pega credentials at all.
    orchestrationMode:
      env.ORCHESTRATION_MODE ?? (pega ? "pega" : "mock-pega"),
    defaultScenarioId: env.DEMO_SCENARIO,
    demoControlEnabled: env.DEMO_CONTROL_ENABLED,
    demoControlPasscode: env.DEMO_CONTROL_PASSCODE,
    pegaDemoModeDefault: env.PEGA_DEMO_MODE_DEFAULT,
    assistantProvider: env.ASSISTANT_PROVIDER,
    pegaAssistantUrl: env.PEGA_ASSISTANT_URL,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiModel: env.OPENAI_MODEL,
    serviceApiKey: env.SERVICE_API_KEY,
    mcpOAuthClientId: env.MCP_OAUTH_CLIENT_ID,
    mcpOAuthClientSecret: env.MCP_OAUTH_CLIENT_SECRET,
    mcpOAuthSigningKey: env.MCP_OAUTH_SIGNING_KEY,
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
  return requirePegaConfigFrom(getServerConfig());
}

/** Pure form, so the guard can be asserted without depending on process.env. */
export function requirePegaConfigFrom(
  config: ServerConfig,
): PegaConnectionConfig {
  if (!config.pega) {
    throw new ConfigurationError(
      `The Pega connection is not configured. ${config.pegaConfigurationIssues.join(" ")}`,
    );
  }

  return config.pega;
}
