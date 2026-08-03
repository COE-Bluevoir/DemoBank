// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DemoSnapshot } from "@/lib/onboarding/types";
import { FileCaseStore, InMemoryCaseStore } from "@/lib/store/case-store";

function initialSnapshot(): DemoSnapshot {
  return {
    settings: {
      orchestrationMode: "mock-pega",
      scenarioId: "ADDRESS_PEP_REVIEW",
      demoControlEnabled: true,
    },
    cases: [],
  };
}

describe("file case store", () => {
  let baseDir: string;
  let filePath: string;
  let store: FileCaseStore;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "northstar-store-"));
    filePath = path.join(baseDir, "nested", "store.json");
    store = new FileCaseStore(filePath, initialSnapshot);
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  it("seeds the snapshot on first read and creates missing directories", () => {
    const snapshot = store.read();

    expect(snapshot.cases).toHaveLength(0);
    expect(snapshot.settings.orchestrationMode).toBe("mock-pega");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("round-trips a written snapshot", () => {
    const snapshot = store.read();
    snapshot.settings.currentCaseId = "ONB-10027";
    store.write(snapshot);

    expect(store.read().settings.currentCaseId).toBe("ONB-10027");
  });

  it("re-seeds after the file is cleared", () => {
    store.write({ ...initialSnapshot(), cases: [] });
    store.clear();

    expect(fs.existsSync(filePath)).toBe(false);
    expect(store.read().cases).toHaveLength(0);
  });
});

describe("in-memory case store", () => {
  it("round-trips a snapshot", () => {
    const store = new InMemoryCaseStore(initialSnapshot);
    const snapshot = store.read();
    snapshot.settings.currentCaseId = "ONB-10027";
    store.write(snapshot);

    expect(store.read().settings.currentCaseId).toBe("ONB-10027");
  });

  it("hands back copies so callers cannot mutate stored state in place", () => {
    const store = new InMemoryCaseStore(initialSnapshot);
    const first = store.read();
    first.settings.currentCaseId = "MUTATED";

    expect(store.read().settings.currentCaseId).toBeUndefined();
  });

  it("resets to the initial snapshot when cleared", () => {
    const store = new InMemoryCaseStore(initialSnapshot);
    const snapshot = store.read();
    snapshot.settings.currentCaseId = "ONB-10027";
    store.write(snapshot);
    store.clear();

    expect(store.read().settings.currentCaseId).toBeUndefined();
  });
});
