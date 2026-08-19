import { randomUUID } from "node:crypto";

import {
  deterministicExecutionId,
  deterministicReference,
} from "@/lib/services/deterministic";
import {
  IdempotencyConflictError,
  runIdempotent,
} from "@/lib/services/idempotency";
import { getToolDefinition, isToolName, listTools } from "@/lib/services/registry";

/**
 * MCP (Model Context Protocol) transport for this app's tool services.
 *
 * A thin protocol layer over `lib/services/registry.ts` — the same allowlist,
 * schemas, handlers and idempotency store the REST endpoint
 * (`/api/services/{tool}`) already uses. Pega's "Connect MCP" rule type calls
 * this instead of the bespoke per-tool REST contract; nothing about what the
 * tools *do* changes, only how they're discovered and invoked.
 *
 * Implements the synchronous subset of MCP's Streamable HTTP transport:
 * `initialize`, `tools/list`, `tools/call`, JSON in and out, no SSE. These
 * tools complete in milliseconds, so a streaming transport buys nothing here.
 */

const PROTOCOL_VERSION = "2025-03-26";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

const addressProperties = {
  addressLine1: { type: "string" },
  city: { type: "string" },
  region: { type: "string" },
  postalCode: { type: "string" },
  country: { type: "string" },
};
const addressRequired = ["addressLine1", "city", "region", "postalCode", "country"];

/**
 * Hand-written rather than derived from the zod schemas in `contracts.ts`:
 * there are ten tools, the shapes are simple and stable, and a bespoke
 * zod-to-JSON-Schema converter is a second thing to keep correct for no
 * benefit a demo needs. Keep this in sync with `contracts.ts` by hand.
 */
const TOOL_SCHEMAS: Record<string, { description: string; inputSchema: Record<string, unknown> }> = {
  "extract-identity": {
    description: "Extract identity fields from an uploaded identity document.",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string" },
        documentId: { type: "string" },
        storageReference: { type: "string" },
      },
      required: ["caseId", "documentId", "storageReference"],
    },
  },
  "extract-address": {
    description: "Extract address fields from an uploaded proof-of-address document.",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string" },
        documentId: { type: "string" },
        storageReference: { type: "string" },
      },
      required: ["caseId", "documentId", "storageReference"],
    },
  },
  "verify-identity": {
    description: "Verify an applicant's identity against the extracted document fields.",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string" },
        fullName: { type: "string" },
        dateOfBirth: { type: "string" },
        documentNumber: { type: "string" },
      },
      required: ["caseId", "fullName", "dateOfBirth", "documentNumber"],
    },
  },
  "validate-address": {
    description: "Compare the application address against the address on a supplied document.",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string" },
        applicationAddress: {
          type: "object",
          properties: addressProperties,
          required: addressRequired,
        },
        documentAddress: {
          type: "object",
          properties: addressProperties,
          required: addressRequired,
        },
      },
      required: ["caseId", "applicationAddress"],
    },
  },
  "screen-sanctions": {
    description: "Screen an applicant against sanctions watchlists.",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string" },
        fullName: { type: "string" },
        dateOfBirth: { type: "string" },
        nationality: { type: "string" },
      },
      required: ["caseId", "fullName", "dateOfBirth", "nationality"],
    },
  },
  "screen-pep": {
    description: "Screen an applicant for politically exposed person status.",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string" },
        fullName: { type: "string" },
        dateOfBirth: { type: "string" },
        nationality: { type: "string" },
      },
      required: ["caseId", "fullName", "dateOfBirth", "nationality"],
    },
  },
  "check-credit-bureau": {
    description: "Run a soft credit bureau enquiry. Returns a score band, never a lending decision.",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string" },
        fullName: { type: "string" },
        dateOfBirth: { type: "string" },
        postalCode: { type: "string" },
      },
      required: ["caseId", "fullName", "dateOfBirth", "postalCode"],
    },
  },
  "check-duplicate": {
    description: "Check whether an applicant already exists as a customer.",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string" },
        fullName: { type: "string" },
        dateOfBirth: { type: "string" },
        email: { type: "string" },
        mobile: { type: "string" },
      },
      required: ["caseId", "fullName", "dateOfBirth", "email", "mobile"],
    },
  },
  "create-customer": {
    description:
      "Open the account and create the customer record. Has an external side effect — always set idempotencyKey.",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string" },
        productCode: { type: "string" },
        applicant: {
          type: "object",
          properties: {
            fullName: { type: "string" },
            dateOfBirth: { type: "string" },
            email: { type: "string" },
            mobile: { type: "string" },
            address: {
              type: "object",
              properties: addressProperties,
              required: addressRequired,
            },
          },
          required: ["fullName", "dateOfBirth", "email", "mobile", "address"],
        },
        idempotencyKey: {
          type: "string",
          description: "Required. A repeated call with the same key and payload replays the original result.",
        },
      },
      required: ["caseId", "productCode", "applicant", "idempotencyKey"],
    },
  },
  "generate-communication": {
    description: "Render the customer-facing email copy for a case milestone.",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string" },
        templateId: {
          type: "string",
          enum: ["WELCOME_ACCOUNT_OPENED", "APPLICATION_SAVED"],
        },
        customerFirstName: { type: "string" },
        productName: { type: "string" },
        customerId: { type: "string" },
        accountId: { type: "string" },
      },
      required: ["caseId", "templateId", "customerFirstName", "productName"],
    },
  },
};

function success(id: string | number | null, result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

function failure(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcFailure {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

/** Content a tool call returns, whichever tool ran. */
function toolResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    isError,
  };
}

export interface McpHandleResult {
  body: JsonRpcSuccess | JsonRpcFailure;
  sessionId: string;
}

/**
 * Handle one MCP JSON-RPC request.
 *
 * `sessionId` is generated on `initialize` and expected back on every later
 * call in the `Mcp-Session-Id` header — mirrored from the shape Pega's own
 * exposed MCP server uses (see docs/pega-mcp-integration.md), for
 * consistency. Not strictly enforced: this is a single-tenant demo tool
 * surface, not a multi-session server, so an absent or stale session id
 * degrades to "handle the call anyway" rather than a hard failure.
 */
export async function handleMcpRequest(
  raw: unknown,
  existingSessionId: string | undefined,
): Promise<McpHandleResult> {
  const sessionId = existingSessionId || `MCP-${randomUUID()}`;
  const request = raw as JsonRpcRequest;
  const id = request?.id ?? null;

  if (!request || typeof request.method !== "string") {
    return {
      sessionId,
      body: failure(id, -32600, "Invalid Request: a JSON-RPC \"method\" is required."),
    };
  }

  switch (request.method) {
    case "initialize":
      return {
        sessionId,
        body: success(id, {
          protocolVersion: PROTOCOL_VERSION,
          serverInfo: { name: "NorthStar Bank Tool Server", version: "1.0.0" },
          capabilities: { tools: { listChanged: false } },
        }),
      };

    case "tools/list": {
      const tools = listTools().map((tool) => ({
        name: tool.name,
        description: TOOL_SCHEMAS[tool.name]?.description ?? tool.name,
        inputSchema: TOOL_SCHEMAS[tool.name]?.inputSchema ?? { type: "object" },
      }));

      return { sessionId, body: success(id, { tools }) };
    }

    case "tools/call": {
      const params = request.params as
        | { name?: string; arguments?: Record<string, unknown> }
        | undefined;
      const toolName = params?.name;

      if (!toolName || !isToolName(toolName)) {
        return {
          sessionId,
          body: success(id, toolResult({ message: `Unknown tool "${toolName}".` }, true)),
        };
      }

      const definition = getToolDefinition(toolName);
      const args = { ...(params?.arguments ?? {}) };
      const idempotencyKey =
        typeof args.idempotencyKey === "string" ? args.idempotencyKey : undefined;
      delete args.idempotencyKey;

      if (definition.requiresIdempotencyKey && !idempotencyKey) {
        return {
          sessionId,
          body: success(
            id,
            toolResult(
              {
                message: `The ${toolName} tool has an external side effect and requires "idempotencyKey".`,
              },
              true,
            ),
          ),
        };
      }

      const parsed = definition.requestSchema.safeParse(args);

      if (!parsed.success) {
        return {
          sessionId,
          body: success(
            id,
            toolResult(
              {
                message: "The request payload did not match the tool contract.",
                issues: parsed.error.issues.map((issue) => ({
                  path: issue.path.join("."),
                  message: issue.message,
                })),
              },
              true,
            ),
          ),
        };
      }

      try {
        const { result, replayed } = await runIdempotent(
          toolName,
          idempotencyKey,
          parsed.data,
          () => definition.handler(parsed.data),
        );

        const seed = `${sessionId}:${JSON.stringify(parsed.data)}`;

        return {
          sessionId,
          body: success(
            id,
            toolResult({
              meta: {
                tool: toolName,
                providerReference: deterministicReference("PRV", seed),
                toolVersion: definition.version,
                executionId: deterministicExecutionId(toolName, seed),
                completedAt: new Date().toISOString(),
                replayed,
              },
              result,
            }),
          ),
        };
      } catch (error) {
        if (error instanceof IdempotencyConflictError) {
          return {
            sessionId,
            body: success(id, toolResult({ message: error.message }, true)),
          };
        }

        return {
          sessionId,
          body: success(
            id,
            toolResult({ message: "The tool could not complete the request." }, true),
          ),
        };
      }
    }

    default:
      return {
        sessionId,
        body: failure(id, -32601, `Method not found: "${request.method}".`),
      };
  }
}
