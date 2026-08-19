import { getServerConfig } from "@/lib/config/env";
import { OnboardingAssistantProvider } from "@/lib/assistant/onboarding-provider";
import { OpenAIAssistantProvider } from "@/lib/assistant/openai-provider";
import { PegaAssistantProvider } from "@/lib/assistant/pega-provider";
import type { AssistantProvider } from "@/lib/assistant/provider";

/**
 * Which system answers the customer.
 *
 * Selected by configuration by default, exactly like the orchestration mode
 * and the storage driver — `ASSISTANT_PROVIDER=pega` routes the chat to
 * Pega's conversational channel; anything else answers from the industry
 * pack. A caller may override that default per request (the chat widget's
 * presenter toggle does this), so a demo can switch backends live without a
 * server restart.
 *
 * Deliberately not tied to `ORCHESTRATION_MODE`: which system runs the
 * workflow and which one answers questions are separate decisions, and
 * conflating them would mean the chat silently changed backend whenever
 * someone flipped the orchestration switch.
 */

let defaultProvider: AssistantProvider | undefined;
let pegaProvider: AssistantProvider | undefined;
let onboardingGuideProvider: AssistantProvider | undefined;
let openaiProvider: AssistantProvider | undefined;

export function getAssistantProvider(
  preferred?: "pega" | "onboarding-guide" | "openai",
): AssistantProvider {
  if (preferred === "pega") {
    return (pegaProvider ??= new PegaAssistantProvider());
  }

  if (preferred === "onboarding-guide") {
    return (onboardingGuideProvider ??= new OnboardingAssistantProvider());
  }

  if (preferred === "openai") {
    return (openaiProvider ??= new OpenAIAssistantProvider());
  }

  if (!defaultProvider) {
    const configured = getServerConfig().assistantProvider;
    defaultProvider =
      configured === "pega"
        ? new PegaAssistantProvider()
        : configured === "openai"
          ? new OpenAIAssistantProvider()
          : new OnboardingAssistantProvider();
  }

  return defaultProvider;
}

/** Test seam. */
export function setAssistantProvider(next: AssistantProvider | undefined): void {
  defaultProvider = next;
}
