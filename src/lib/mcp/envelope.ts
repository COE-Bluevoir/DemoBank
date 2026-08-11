import { z } from "zod";

/**
 * The envelope every Mock Enterprise Services tool speaks.
 *
 * One shape for every tool, so the orchestration layer can log, correlate and
 * retry uniformly without knowing which tool it called. Industry behaviour is
 * selected from `industryCode` and `journeyCode` inside the tool rather than
 * by exposing a different tool per industry.
 *
 * These services are test doubles. They return facts, signals and fulfilment
 * responses — never a decision about the case. What a REVIEW finding means is
 * for the workflow to decide, which is the whole point of the comparison this
 * accelerator exists to make.
 */

export const INDUSTRY_CODES = ["BANKING", "INSURANCE", "TELECOM"] as const;

export const JOURNEY_CODES = [
  "BUSINESS_CURRENT_ACCOUNT",
  "COMMERCIAL_PROPERTY_POLICY",
  "BUSINESS_CONNECTIVITY",
] as const;

export const toolRequestSchema = z.object({
  correlationId: z.string().min(1),
  industryCode: z.enum(INDUSTRY_CODES),
  journeyCode: z.enum(JOURNEY_CODES),
  caseId: z.string().min(1),
  /** A repeated key must return the first result, never act twice. */
  idempotencyKey: z.string().min(1),
  schemaVersion: z.literal("1.0"),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export type ToolRequest = z.infer<typeof toolRequestSchema>;

/**
 * Outcomes a tool may report.
 *
 * Deliberately a finding vocabulary, not a decision vocabulary: there is no
 * APPROVED or DECLINED here, because a test double must not be able to
 * express them.
 */
export const TOOL_STATUSES = [
  "SUCCESS",
  "PASS",
  "CLEAR",
  "REVIEW",
  "FAIL",
  "MISMATCH",
  "PARTIAL",
  "NO_MATCH",
  "MATCH",
  "VALID",
  "VERIFIED",
  "NOT_VERIFIED",
  "AVAILABLE",
  "UNAVAILABLE",
  "SENT",
] as const;

export type ToolStatus = (typeof TOOL_STATUSES)[number];

export interface ToolResponse {
  status: ToolStatus;
  providerReference: string;
  reasonCode?: string;
  /** Present where the provider expresses certainty; absent where it does not. */
  confidence?: number;
  /** What the finding is based on, so a reviewer can check it. */
  evidence?: Record<string, unknown>;
  timestamp: string;
}

export function toolResponse(
  status: ToolStatus,
  providerReference: string,
  extra: Omit<ToolResponse, "status" | "providerReference" | "timestamp"> = {},
): ToolResponse {
  return {
    status,
    providerReference,
    ...extra,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Scenario selector for the demo.
 *
 * Chosen server-side. The customer-facing UI must never be able to set this:
 * a demo in which the browser can choose what the screening service returns
 * proves nothing about the workflow.
 */
export const FIXTURE_MODES = [
  "BANKING_HERO",
  "INSURANCE_HERO",
  "TELECOM_HERO",
  "HAPPY_PATH",
  "TECHNICAL_FAILURE",
] as const;

export type FixtureMode = (typeof FIXTURE_MODES)[number];

/** The tools the accelerator contract defines. */
export const MCP_TOOLS = [
  "extract_document",
  "verify_entity",
  "check_duplicate",
  "screen_party",
  "validate_address",
  "evaluate_external_risk",
  "check_serviceability",
  "create_customer",
  "activate_service",
  "send_notification",
] as const;

export type McpToolName = (typeof MCP_TOOLS)[number];

/** Tools that simulate a side effect and therefore must be idempotent. */
export const SIDE_EFFECTING_TOOLS: ReadonlySet<McpToolName> = new Set([
  "create_customer",
  "activate_service",
  "send_notification",
]);
