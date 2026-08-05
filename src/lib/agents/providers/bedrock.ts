import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import type { z } from "zod";

import type {
  AgentProvider,
  CompletionRequest,
  CompletionResult,
} from "@/lib/agents/provider";
import { AgentProviderError } from "@/lib/agents/provider";
import { getServerConfig } from "@/lib/config/env";

/**
 * Amazon Bedrock provider.
 *
 * Structured output is obtained by asking for JSON and validating it against
 * the caller's schema. A response that does not conform gets exactly one
 * repair attempt, quoting the validation error back to the model; a second
 * failure is an error rather than something the caller must defend against.
 */

/**
 * Bedrock rejects bare model IDs for models served through cross-region
 * inference: `amazon.nova-pro-v1:0` fails where `us.amazon.nova-pro-v1:0`
 * succeeds. Verified against this account.
 */
const INFERENCE_PROFILE_PREFIXES = ["us.", "eu.", "apac.", "us-gov."];

export function toInferenceProfileId(modelId: string, region: string): string {
  if (INFERENCE_PROFILE_PREFIXES.some((prefix) => modelId.startsWith(prefix))) {
    return modelId;
  }

  // Region families map onto the profile prefix Bedrock expects.
  if (region.startsWith("eu-")) {
    return `eu.${modelId}`;
  }

  if (region.startsWith("ap-")) {
    return `apac.${modelId}`;
  }

  return `us.${modelId}`;
}

/**
 * Models sometimes wrap JSON in prose or a fenced block despite instructions.
 * Recovering the object is cheaper than a repair round trip.
 */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    // Fall back to the outermost braces.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      throw new AgentProviderError("Model response contained no JSON object.");
    }

    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch (error) {
      throw new AgentProviderError(
        "Model response contained malformed JSON.",
        error,
      );
    }
  }
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

let client: BedrockRuntimeClient | undefined;

function getClient(region: string): BedrockRuntimeClient {
  if (!client) {
    // Credentials come from the default provider chain, never from config.
    client = new BedrockRuntimeClient({ region });
  }

  return client;
}

/** Test seam: drop the memoized client. */
export function resetBedrockClient(): void {
  client = undefined;
}

export class BedrockAgentProvider implements AgentProvider {
  readonly name = "bedrock" as const;

  constructor(
    private readonly modelId: string,
    private readonly region: string,
  ) {}

  async complete<TSchema extends z.ZodType>(
    request: CompletionRequest<TSchema>,
  ): Promise<CompletionResult<z.infer<TSchema>>> {
    const resolvedModelId = toInferenceProfileId(this.modelId, this.region);
    const messages: Message[] = [
      { role: "user", content: [{ text: request.user }] },
    ];

    const first = await this.converse(resolvedModelId, request, messages);
    const parsed = request.schema.safeParse(safeExtract(first));

    if (parsed.success) {
      return { value: parsed.data, modelId: resolvedModelId, repaired: false };
    }

    // One repair attempt, telling the model exactly what was wrong.
    messages.push({ role: "assistant", content: [{ text: first }] });
    messages.push({
      role: "user",
      content: [
        {
          text: `That response did not match the required format: ${describeIssues(parsed.error)}. Reply with corrected JSON only.`,
        },
      ],
    });

    const second = await this.converse(resolvedModelId, request, messages);
    const repaired = request.schema.safeParse(safeExtract(second));

    if (!repaired.success) {
      throw new AgentProviderError(
        `Model output failed validation for ${request.promptTemplateId} after one repair: ${describeIssues(repaired.error)}`,
      );
    }

    return { value: repaired.data, modelId: resolvedModelId, repaired: true };
  }

  private async converse(
    modelId: string,
    request: CompletionRequest<z.ZodType>,
    messages: Message[],
  ): Promise<string> {
    try {
      const response = await getClient(this.region).send(
        new ConverseCommand({
          modelId,
          system: [{ text: request.system }],
          messages,
          inferenceConfig: {
            maxTokens: request.maxTokens ?? 600,
            // Low temperature: a scripted demo must be repeatable, and
            // routing decisions should not vary between identical inputs.
            temperature: 0.1,
          },
        }),
      );

      const text = response.output?.message?.content?.[0]?.text;

      if (!text) {
        throw new AgentProviderError("Model returned an empty response.");
      }

      // A truncated response leaves the JSON unterminated, which otherwise
      // surfaces as a confusing parse failure. Name the real cause.
      if (response.stopReason === "max_tokens") {
        throw new AgentProviderError(
          `Model response for ${request.promptTemplateId} was truncated at the token limit; raise maxTokens or shorten the prompt.`,
        );
      }

      return text;
    } catch (error) {
      if (error instanceof AgentProviderError) {
        throw error;
      }

      throw new AgentProviderError(
        `Bedrock call failed for ${modelId}.`,
        error,
      );
    }
  }
}

/** Parsing failures become a validation failure, so repair can handle them. */
function safeExtract(text: string): unknown {
  try {
    return extractJsonObject(text);
  } catch {
    return undefined;
  }
}

export function createBedrockProvider(modelId?: string): BedrockAgentProvider {
  const config = getServerConfig();

  return new BedrockAgentProvider(
    modelId ?? config.agents.modelId,
    config.agents.region,
  );
}
