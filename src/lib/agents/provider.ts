import type { z } from "zod";

/**
 * The model boundary.
 *
 * Agents are written against this interface, not against Bedrock. That keeps
 * the orchestration logic testable without network access and means the demo
 * still runs if the model is unavailable — the failure mode of an AI demo
 * should not be a blank screen.
 */

export interface CompletionRequest<TSchema extends z.ZodType> {
  /** Identifies the prompt for the governance record. */
  promptTemplateId: string;
  promptVersion: string;
  /** Instructions describing the agent's role and its output contract. */
  system: string;
  /** The user-side content for this turn. */
  user: string;
  /** The shape the response must satisfy. */
  schema: TSchema;
  /** Upper bound on response length. */
  maxTokens?: number;
}

export interface CompletionResult<T> {
  value: T;
  modelId?: string;
  /** True when the first response failed validation and a repair succeeded. */
  repaired: boolean;
}

export interface AgentProvider {
  readonly name: "deterministic" | "bedrock";
  /**
   * Produce a value satisfying `schema`.
   *
   * Implementations must validate before returning: an unparseable or
   * non-conforming response is an error, never something the caller has to
   * defend against.
   */
  complete<TSchema extends z.ZodType>(
    request: CompletionRequest<TSchema>,
  ): Promise<CompletionResult<z.infer<TSchema>>>;
}

export class AgentProviderError extends Error {
  /** Safe to show a customer. */
  readonly customerMessage =
    "We could not process that request right now. Please try again.";

  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AgentProviderError";
  }
}
