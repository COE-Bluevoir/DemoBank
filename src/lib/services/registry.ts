import type { z } from "zod";

import {
  TOOL_NAMES,
  type ToolName,
  createCustomerRequestSchema,
  duplicateCheckRequestSchema,
  extractAddressRequestSchema,
  extractIdentityRequestSchema,
  generateCommunicationRequestSchema,
  screeningRequestSchema,
  validateAddressRequestSchema,
  verifyIdentityRequestSchema,
} from "@/lib/services/contracts";
import {
  extractAddress,
  extractIdentity,
  validateAddress,
  verifyIdentity,
} from "@/lib/services/handlers/extraction";
import {
  createCustomer,
  generateCommunication,
} from "@/lib/services/handlers/fulfilment";
import {
  checkDuplicate,
  screenPep,
  screenSanctions,
} from "@/lib/services/handlers/screening";

/**
 * Tool allowlist.
 *
 * A tool is invocable only if it appears here. The registry is the single
 * place that binds a tool name to its request schema, its handler and its
 * retry-safety requirement.
 */

export interface ToolDefinition<TSchema extends z.ZodType = z.ZodType> {
  name: ToolName;
  version: string;
  requestSchema: TSchema;
  handler: (request: z.infer<TSchema>) => unknown;
  /** Provider identity recorded in the audit trail. */
  provider: string;
  /**
   * True when the tool has an external side effect and a caller must supply an
   * idempotency key. Requests without one are rejected.
   */
  requiresIdempotencyKey: boolean;
}

function define<TSchema extends z.ZodType>(
  definition: ToolDefinition<TSchema>,
): ToolDefinition {
  return definition as unknown as ToolDefinition;
}

const REGISTRY: Record<ToolName, ToolDefinition> = {
  "extract-identity": define({
    name: "extract-identity",
    version: "1.0.0",
    provider: "northstar-mock-document-ai",
    requestSchema: extractIdentityRequestSchema,
    handler: extractIdentity,
    requiresIdempotencyKey: false,
  }),
  "extract-address": define({
    name: "extract-address",
    version: "1.0.0",
    provider: "northstar-mock-document-ai",
    requestSchema: extractAddressRequestSchema,
    handler: extractAddress,
    requiresIdempotencyKey: false,
  }),
  "verify-identity": define({
    name: "verify-identity",
    version: "1.0.0",
    provider: "northstar-mock-identity-bureau",
    requestSchema: verifyIdentityRequestSchema,
    handler: verifyIdentity,
    requiresIdempotencyKey: false,
  }),
  "validate-address": define({
    name: "validate-address",
    version: "1.0.0",
    provider: "northstar-mock-address-service",
    requestSchema: validateAddressRequestSchema,
    handler: validateAddress,
    requiresIdempotencyKey: false,
  }),
  "screen-sanctions": define({
    name: "screen-sanctions",
    version: "1.0.0",
    provider: "northstar-mock-screening",
    requestSchema: screeningRequestSchema,
    handler: screenSanctions,
    requiresIdempotencyKey: false,
  }),
  "screen-pep": define({
    name: "screen-pep",
    version: "1.0.0",
    provider: "northstar-mock-screening",
    requestSchema: screeningRequestSchema,
    handler: screenPep,
    requiresIdempotencyKey: false,
  }),
  "check-duplicate": define({
    name: "check-duplicate",
    version: "1.0.0",
    provider: "northstar-mock-customer-index",
    requestSchema: duplicateCheckRequestSchema,
    handler: checkDuplicate,
    requiresIdempotencyKey: false,
  }),
  "create-customer": define({
    name: "create-customer",
    version: "1.0.0",
    provider: "northstar-mock-core-banking",
    requestSchema: createCustomerRequestSchema,
    handler: createCustomer,
    // Opening an account twice is the failure this guards against.
    requiresIdempotencyKey: true,
  }),
  "generate-communication": define({
    name: "generate-communication",
    version: "1.0.0",
    provider: "northstar-mock-communications",
    requestSchema: generateCommunicationRequestSchema,
    handler: generateCommunication,
    requiresIdempotencyKey: false,
  }),
};

export function isToolName(value: string): value is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(value);
}

export function getToolDefinition(name: ToolName): ToolDefinition {
  return REGISTRY[name];
}

export function listTools(): Array<{
  name: ToolName;
  version: string;
  provider: string;
  requiresIdempotencyKey: boolean;
}> {
  return Object.values(REGISTRY).map((tool) => ({
    name: tool.name,
    version: tool.version,
    provider: tool.provider,
    requiresIdempotencyKey: tool.requiresIdempotencyKey,
  }));
}
