import type { ToolName } from "@/lib/services/contracts";
import { getToolDefinition, isToolName } from "@/lib/services/registry";
import { runIdempotent } from "@/lib/services/idempotency";

/**
 * How agents reach enterprise services.
 *
 * Today the tools run in this process. In a deployed environment they are
 * fronted by AgentCore Gateway and reached over MCP — which requires a
 * publicly resolvable endpoint, so it cannot be wired from a laptop. The seam
 * exists so that change is a transport swap rather than an agent rewrite.
 *
 * Either way the allowlist is enforced here, server-side: an agent cannot
 * invoke a capability that is not registered, whatever the model asks for.
 */

export interface ToolInvocation {
  tool: string;
  input: unknown;
  /** Required for tools with an external side effect. */
  idempotencyKey?: string;
}

export interface ToolResult<T = unknown> {
  tool: ToolName;
  output: T;
  /** True when a stored result was replayed rather than recomputed. */
  replayed: boolean;
  latencyMs: number;
}

export class ToolInvocationError extends Error {
  constructor(
    message: string,
    readonly tool: string,
  ) {
    super(message);
    this.name = "ToolInvocationError";
  }
}

export interface ToolInvoker {
  readonly transport: "direct" | "mcp";
  invoke<T = unknown>(invocation: ToolInvocation): Promise<ToolResult<T>>;
}

/**
 * In-process invoker.
 *
 * Calls the same registered handlers the HTTP endpoint calls, so behaviour is
 * identical to what Pega gets over the wire, without a self-request.
 */
export class DirectToolInvoker implements ToolInvoker {
  readonly transport = "direct" as const;

  async invoke<T = unknown>(
    invocation: ToolInvocation,
  ): Promise<ToolResult<T>> {
    if (!isToolName(invocation.tool)) {
      throw new ToolInvocationError(
        `${invocation.tool} is not an approved tool.`,
        invocation.tool,
      );
    }

    const definition = getToolDefinition(invocation.tool);

    if (definition.requiresIdempotencyKey && !invocation.idempotencyKey) {
      throw new ToolInvocationError(
        `${invocation.tool} has an external side effect and requires an idempotency key.`,
        invocation.tool,
      );
    }

    const parsed = definition.requestSchema.safeParse(invocation.input);

    if (!parsed.success) {
      throw new ToolInvocationError(
        `Input for ${invocation.tool} did not match its contract: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
        invocation.tool,
      );
    }

    const startedAt = Date.now();

    const { result, replayed } = await runIdempotent(
      invocation.tool,
      invocation.idempotencyKey,
      parsed.data,
      () => definition.handler(parsed.data),
    );

    return {
      tool: invocation.tool,
      output: result as T,
      replayed,
      latencyMs: Date.now() - startedAt,
    };
  }
}

let invoker: ToolInvoker | undefined;

export function getToolInvoker(): ToolInvoker {
  if (!invoker) {
    invoker = new DirectToolInvoker();
  }

  return invoker;
}

/** Test seam, and where an MCP-backed invoker will be installed. */
export function setToolInvoker(next: ToolInvoker | undefined): void {
  invoker = next;
}
