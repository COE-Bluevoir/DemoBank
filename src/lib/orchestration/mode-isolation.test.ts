// @vitest-environment node
import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { NonPegaOrchestrationAdapter } from "@/lib/orchestration/non-pega-adapter";
import {
  InMemoryNonPegaCaseStore,
  setNonPegaCaseStore,
} from "@/lib/orchestration/case-store";
import { CONSENT_VERSION, DEMO_CUSTOMER } from "@/lib/onboarding/constants";

/**
 * The two modes must stay mutually exclusive.
 *
 * `pega` means Pega is the complete orchestration authority and no Bedrock
 * agent takes part in the business workflow. `non-pega` means the alternative
 * is complete and Pega is never called. Comparing the two is only meaningful
 * if neither quietly borrows from the other, and the easiest way to lose that
 * property is a single convenient import. So the rule is tested, not assumed.
 */

const SOURCE_ROOT = path.join(process.cwd(), "src");

/** Resolve a `@/...` or relative specifier to a file on disk. */
function resolveModule(specifier: string, fromFile: string): string | undefined {
  const base = specifier.startsWith("@/")
    ? path.join(SOURCE_ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(fromFile), specifier)
      : undefined;

  if (!base) {
    // A bare specifier is a package, not our code.
    return undefined;
  }

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
  ]) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

const IMPORT_PATTERN = /(?:from|import)\s+["']([^"']+)["']/g;

/** Every first-party module reachable from `entry`, including itself. */
function transitiveImports(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const current = queue.pop()!;

    if (seen.has(current)) {
      continue;
    }

    seen.add(current);

    const source = fs.readFileSync(current, "utf8");

    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const resolved = resolveModule(match[1], current);

      // Type-only imports still count: reaching for another mode's types is
      // the first step toward reaching for its behaviour.
      if (resolved && !resolved.endsWith(".test.ts")) {
        queue.push(resolved);
      }
    }
  }

  return seen;
}

function within(files: Set<string>, directory: string): string[] {
  const target = path.join(SOURCE_ROOT, ...directory.split("/"));

  return [...files]
    .filter((file) => file.startsWith(target + path.sep))
    .map((file) => path.relative(SOURCE_ROOT, file).replace(/\\/g, "/"));
}

describe("mode isolation", () => {
  it("the pega orchestration cannot reach the agent layer", () => {
    const reachable = transitiveImports(
      path.join(SOURCE_ROOT, "lib", "pega", "adapter.ts"),
    );

    // If this fails, a Bedrock agent has been given a way into the governed
    // workflow and `pega` mode is no longer Pega-authoritative.
    expect(within(reachable, "lib/agents")).toEqual([]);
    expect(within(reachable, "lib/orchestration")).toEqual([]);
  });

  it("the non-pega orchestration cannot reach pega", () => {
    const reachable = transitiveImports(
      path.join(SOURCE_ROOT, "lib", "orchestration", "non-pega-adapter.ts"),
    );

    // If this fails, the alternative implementation is leaning on the system
    // it is supposed to be an alternative to.
    expect(within(reachable, "lib/pega")).toEqual([]);
  });
});

describe("non-pega journey", () => {
  afterEach(() => {
    setNonPegaCaseStore(undefined);
    vi.unstubAllGlobals();
  });

  it("completes without a single outbound call to Pega", async () => {
    setNonPegaCaseStore(new InMemoryNonPegaCaseStore());

    // Any network call at all fails the test. Pega is reached over HTTP, so
    // proving nothing left the process proves Pega was not consulted.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("non-pega mode must not make outbound calls");
      }),
    );

    const adapter = new NonPegaOrchestrationAdapter();

    const created = await adapter.createCase({
      productCode: "EVERYDAY_PLUS",
      channel: "WEB",
      scenarioId: "ADDRESS_PEP_REVIEW",
      industryId: "banking",
    });

    const begun = await adapter.submitAction(created.caseId, {
      actionId: "BEGIN_APPLICATION",
      expectedCaseVersion: created.caseVersion,
    });

    const detailed = await adapter.submitAction(created.caseId, {
      actionId: "SUBMIT_DETAILS",
      expectedCaseVersion: begun.caseVersion,
      data: { ...DEMO_CUSTOMER },
    });

    const consented = await adapter.submitAction(created.caseId, {
      actionId: "ACCEPT_CONSENT",
      expectedCaseVersion: detailed.caseVersion,
      data: {
        accepted: true,
        timestamp: new Date().toISOString(),
        textVersion: CONSENT_VERSION,
        channel: "WEB",
      },
    });

    expect(consented.caseId).toBe(created.caseId);
    expect(consented.status).toBe("DOCUMENTS_REQUIRED");
    expect(fetch).not.toHaveBeenCalled();
  });
});
