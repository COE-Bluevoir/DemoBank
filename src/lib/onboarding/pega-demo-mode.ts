import { getServerConfig } from "@/lib/config/env";

/**
 * Presenter-controlled flag threaded into new Pega cases as `DemoModeEnabled`.
 *
 * Deliberately its own leaf module rather than part of the demo-settings
 * snapshot in `engine.ts`: the live Pega adapter needs to read this value,
 * and `engine.ts` reaches into the non-pega orchestration and the Bedrock
 * agent layer. Importing engine.ts from `pega/adapter.ts` would drag that
 * whole graph into the pega-mode import boundary that
 * `lib/orchestration/mode-isolation.test.ts` enforces must stay Pega-only.
 */
let current: boolean | undefined;

export function getPegaDemoModeEnabled(): boolean {
  if (current === undefined) {
    current = getServerConfig().pegaDemoModeDefault;
  }

  return current;
}

export function setPegaDemoModeEnabled(value: boolean): boolean {
  current = value;
  return current;
}
