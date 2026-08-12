import { getServerConfig } from "@/lib/config/env";
import { OnboardingAssistantProvider } from "@/lib/assistant/onboarding-provider";
import { PegaAssistantProvider } from "@/lib/assistant/pega-provider";
import type { AssistantProvider } from "@/lib/assistant/provider";

/**
 * Which system answers the customer.
 *
 * Selected by configuration, exactly like the orchestration mode and the
 * storage driver. `ASSISTANT_PROVIDER=pega` routes the chat to Pega's
 * conversational channel; anything else answers from the industry pack.
 *
 * Deliberately not tied to `ORCHESTRATION_MODE`: which system runs the
 * workflow and which one answers questions are separate decisions, and
 * conflating them would mean the chat silently changed backend whenever
 * someone flipped the orchestration switch.
 */

let provider: AssistantProvider | undefined;

export function getAssistantProvider(): AssistantProvider {
  if (!provider) {
    provider =
      getServerConfig().assistantProvider === "pega"
        ? new PegaAssistantProvider()
        : new OnboardingAssistantProvider();
  }

  return provider;
}

/** Test seam. */
export function setAssistantProvider(next: AssistantProvider | undefined): void {
  provider = next;
}
