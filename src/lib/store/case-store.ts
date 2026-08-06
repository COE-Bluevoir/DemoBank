import fs from "node:fs";
import path from "node:path";

import type { DemoSnapshot } from "@/lib/onboarding/types";

/**
 * Persistence boundary for onboarding case state.
 *
 * The engine reads and writes through this interface only, so replacing the
 * local JSON file with a database or a shared cache is a matter of providing
 * another implementation — no engine changes.
 */

export interface CaseStore {
  read(): DemoSnapshot;
  write(snapshot: DemoSnapshot): void;
  clear(): void;
}

const DEFAULT_DIR = path.join(process.cwd(), ".demo-data");
const DEFAULT_FILE = path.join(DEFAULT_DIR, "northstar-demo-store.json");

/**
 * File-backed store.
 *
 * Suitable for a single-instance demo deployment. It is deliberately
 * synchronous: the engine's state transitions are short, and serialising them
 * avoids interleaved reads and writes on the same snapshot.
 */
export class FileCaseStore implements CaseStore {
  constructor(
    private readonly filePath: string = DEFAULT_FILE,
    private readonly createInitialSnapshot: () => DemoSnapshot,
  ) {}

  read(): DemoSnapshot {
    this.ensure();
    return JSON.parse(fs.readFileSync(this.filePath, "utf8")) as DemoSnapshot;
  }

  write(snapshot: DemoSnapshot): void {
    this.ensure();

    // Write then rename. A plain write is not atomic, and this file is read by
    // request handlers running concurrently with the one writing it — a reader
    // that arrives mid-write gets truncated JSON.
    const temporary = `${this.filePath}.${process.pid}.tmp`;

    fs.writeFileSync(temporary, JSON.stringify(snapshot, null, 2));
    fs.renameSync(temporary, this.filePath);
  }

  clear(): void {
    fs.rmSync(this.filePath, { force: true });
  }

  private ensure(): void {
    const directory = path.dirname(this.filePath);

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(
        this.filePath,
        JSON.stringify(this.createInitialSnapshot(), null, 2),
      );
    }
  }
}

/** In-memory store, used by tests and by ephemeral environments. */
export class InMemoryCaseStore implements CaseStore {
  private snapshot?: DemoSnapshot;

  constructor(private readonly createInitialSnapshot: () => DemoSnapshot) {}

  read(): DemoSnapshot {
    if (!this.snapshot) {
      this.snapshot = this.createInitialSnapshot();
    }

    // Hand back a copy so callers cannot mutate stored state accidentally.
    return structuredClone(this.snapshot);
  }

  write(snapshot: DemoSnapshot): void {
    this.snapshot = structuredClone(snapshot);
  }

  clear(): void {
    this.snapshot = undefined;
  }
}
