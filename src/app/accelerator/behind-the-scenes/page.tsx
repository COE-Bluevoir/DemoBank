import type { Metadata } from "next";
import Link from "next/link";

import { BehindTheScenesDiagram } from "@/components/behind-the-scenes-diagram";
import { Card, SectionTitle } from "@/components/ui";

export const metadata: Metadata = {
  title: "Behind the scenes",
  description:
    "How a case actually moves between this app and Pega — the conversational agent, Pega's own orchestrator and specialist agents, and the inbound MCP/A2A integrations, each hop labelled with its real protocol.",
};

export default function BehindTheScenesPage() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-soft)]">
      <header className="border-b border-[var(--color-border)] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 lg:px-8">
          <div>
            <p className="text-lg font-semibold text-[var(--color-ink)]">
              Behind the scenes
            </p>
            <p className="text-sm text-[var(--color-ink-subtle)]">
              What actually happens between this app and Pega, step by step
            </p>
          </div>
          <Link
            href="/accelerator"
            className="text-sm text-[var(--color-ink-subtle)] underline-offset-4 hover:underline"
          >
            Accelerator
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10 lg:px-8">
        <Card className="space-y-5">
          <SectionTitle
            eyebrow="System interactions, one hop at a time"
            title="How a case moves between this app and Pega"
            description="A conversational agent outside Pega, a REST handoff into the case, Pega's own orchestrator agent delegating to its specialist agents (native to Pega, not built here), and — separately — the inbound MCP and A2A integrations this app exposes for Pega to call. Each step named with what actually does the work and the real protocol it uses. A fixed walkthrough, not a live feed, so it stays presentable regardless of what a real case is doing right now."
          />
          <BehindTheScenesDiagram />
        </Card>
      </main>
    </div>
  );
}
