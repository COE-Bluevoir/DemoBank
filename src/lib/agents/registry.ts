import type { AgentProvider } from "@/lib/agents/provider";
import { BedrockAgentProvider } from "@/lib/agents/providers/bedrock";
import { DeterministicAgentProvider } from "@/lib/agents/providers/deterministic";
import { getServerConfig } from "@/lib/config/env";

/**
 * Provider selection.
 *
 * Chosen by configuration, exactly like the storage driver, so the same code
 * path runs whether or not a model is reachable.
 */

/**
 * Not every agent needs the same model.
 *
 * `routing` is called on every turn and only has to classify, so a small model
 * is the right economics. `reasoning` produces grounded answers against a
 * stricter schema, where a small model fails to hold the output contract.
 */
export type AgentRole = "routing" | "reasoning";

const providers = new Map<AgentRole, AgentProvider>();

export function getAgentProvider(role: AgentRole = "routing"): AgentProvider {
  const existing = providers.get(role);

  if (existing) {
    return existing;
  }

  const { agents } = getServerConfig();

  const provider: AgentProvider =
    agents.provider === "bedrock"
      ? new BedrockAgentProvider(
          role === "reasoning" ? agents.reasoningModelId : agents.modelId,
          agents.region,
        )
      : new DeterministicAgentProvider();

  providers.set(role, provider);
  return provider;
}

/** Test seam: install a specific provider for every role. */
export function setAgentProvider(next: AgentProvider | undefined): void {
  providers.clear();

  if (next) {
    providers.set("routing", next);
    providers.set("reasoning", next);
  }
}
