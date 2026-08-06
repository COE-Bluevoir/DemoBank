import "@testing-library/jest-dom/vitest";

/**
 * Unit tests run against a known configuration, never the ambient one.
 *
 * Without this, a build environment holding real Pega credentials, the AWS
 * storage driver or a live model provider silently changes what the tests
 * exercise: they begin reaching real services, and assertions about
 * unconfigured behaviour pass or fail depending on where they run. A test that
 * only holds on a laptop is not a test.
 *
 * Anything that needs different configuration should set it explicitly, or use
 * the `loadServerConfigFrom` seam.
 */
const DEPLOYMENT_ENV_KEYS = [
  "ORCHESTRATION_MODE",
  "STORAGE_DRIVER",
  "DYNAMODB_TABLE_NAME",
  "S3_DOCUMENT_BUCKET",
  "DOCUMENT_STORAGE_DIR",
  "AGENT_PROVIDER",
  "BEDROCK_REGION",
  "BEDROCK_MODEL_ID",
  "BEDROCK_REASONING_MODEL_ID",
  "PEGA_BASE_URL",
  "PEGA_TOKEN_URL",
  "PEGA_CLIENT_ID",
  "PEGA_CLIENT_SECRET",
  "PEGA_CASE_TYPE_ID",
  "SERVICE_API_KEY",
  "DEMO_CONTROL_ENABLED",
  "DEMO_CONTROL_PASSCODE",
  "DEMO_SCENARIO",
] as const;

for (const key of DEPLOYMENT_ENV_KEYS) {
  delete process.env[key];
}
