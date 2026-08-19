"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

import {
  NODES,
  PROTOCOL_LABEL,
  STEPS,
  type DiagramNode,
  type NodeId,
} from "@/lib/accelerator/behind-the-scenes";
import { Badge, Button } from "@/components/ui";

const NODE_BY_ID: Record<NodeId, DiagramNode> = Object.fromEntries(
  NODES.map((node) => [node.id, node]),
) as Record<NodeId, DiagramNode>;

/** Every distinct connection in the system, independent of which step is active — the permanent "map" underneath the story. */
const BASE_PAIRS = Array.from(
  new Map(
    STEPS.map((step) => {
      const key = [step.from, step.to].sort().join("::");
      return [key, { from: step.from, to: step.to }] as const;
    }),
  ).values(),
);

function subscribeReducedMotion(callback: () => void): () => void {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function edgePath(fromId: NodeId, toId: NodeId): string {
  const from = NODE_BY_ID[fromId];
  const to = NODE_BY_ID[toId];
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}

const ZONE_STYLE: Record<DiagramNode["zone"], { border: string; badge: string }> = {
  customer: { border: "var(--color-ink-muted)", badge: "var(--color-ink-muted)" },
  app: { border: "var(--color-primary)", badge: "var(--color-primary)" },
  pega: { border: "var(--color-navy)", badge: "var(--color-navy)" },
};

/**
 * A fixed, presenter-controlled walkthrough of how a case actually moves
 * between this app and Pega — REST case orchestration, Pega's own two
 * agents, and the inbound MCP/A2A integrations, each labelled with its real
 * protocol. See lib/accelerator/behind-the-scenes.ts for why this is a
 * scripted sequence rather than a live replay: it has to stay presentable
 * even if a real case (or Pega itself) is misbehaving at that moment.
 */
export function BehindTheScenesDiagram() {
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const reducedMotion = useReducedMotion();
  const step = STEPS[stepIndex];

  useEffect(() => {
    if (!playing) {
      return;
    }

    const timer = window.setTimeout(() => {
      setStepIndex((current) => {
        if (current >= STEPS.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 3600);

    return () => window.clearTimeout(timer);
  }, [playing, stepIndex]);

  const activeNodeIds = useMemo(
    () => new Set<NodeId>([step.from, step.to]),
    [step],
  );

  const activePath = edgePath(step.from, step.to);

  return (
    <div className="space-y-5">
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-white">
        {/* Zone backgrounds */}
        <div
          className="absolute rounded-2xl border border-dashed"
          style={{
            left: "4%",
            top: "12%",
            width: "40%",
            height: "80%",
            borderColor: "color-mix(in srgb, var(--color-primary) 35%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--color-primary) 4%, transparent)",
          }}
        >
          <p
            className="absolute -top-3 left-4 rounded-full bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--color-primary)" }}
          >
            This app — Next.js
          </p>
        </div>
        <div
          className="absolute rounded-2xl border border-dashed"
          style={{
            left: "52%",
            top: "12%",
            width: "44%",
            height: "80%",
            borderColor: "color-mix(in srgb, var(--color-navy) 35%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--color-navy) 4%, transparent)",
          }}
        >
          <p
            className="absolute -top-3 left-4 rounded-full bg-white px-2 text-[10px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--color-navy)" }}
          >
            Pega Infinity — orchestrator &amp; specialist agents
          </p>
        </div>

        {/* Edges */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <marker
              id="arrow-active"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="var(--color-teal)" />
            </marker>
          </defs>

          {BASE_PAIRS.map((pair) => (
            <path
              key={`${pair.from}-${pair.to}`}
              d={edgePath(pair.from, pair.to)}
              stroke="var(--color-border-strong)"
              strokeWidth={0.4}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path
            key={`active-${step.id}`}
            d={activePath}
            stroke="var(--color-teal)"
            strokeWidth={0.7}
            fill="none"
            vectorEffect="non-scaling-stroke"
            markerEnd="url(#arrow-active)"
            className={reducedMotion ? undefined : "animate-pulse"}
          />

          {!reducedMotion ? (
            <circle key={`dot-${step.id}`} r={1.1} fill="var(--color-teal)">
              <animateMotion
                key={step.id}
                dur="1.1s"
                repeatCount="indefinite"
                path={activePath}
              />
            </circle>
          ) : null}
        </svg>

        {/* Nodes */}
        {NODES.map((node) => {
          const active = activeNodeIds.has(node.id);
          const style = ZONE_STYLE[node.zone];

          return (
            <div
              key={node.id}
              className={[
                "absolute w-[19%] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-white px-2 py-1.5 text-center shadow-sm transition-all duration-300",
                active ? "scale-105 shadow-md" : "opacity-80",
              ].join(" ")}
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                borderColor: active ? style.border : "var(--color-border)",
                borderWidth: active ? 2 : 1,
              }}
            >
              <p className="text-[10.5px] font-semibold leading-tight text-[var(--color-ink)]">
                {node.label}
              </p>
              <p className="text-[9px] leading-tight text-[var(--color-ink-muted)]">
                {node.sublabel}
              </p>
            </div>
          );
        })}
      </div>

      <div className="space-y-3 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">{PROTOCOL_LABEL[step.protocol]}</Badge>
          <span className="text-xs text-[var(--color-ink-muted)]">
            Step {stepIndex + 1} of {STEPS.length}
          </span>
        </div>
        <p className="text-sm font-semibold text-[var(--color-ink)]">
          {step.title}
        </p>
        <p className="text-sm leading-6 text-[var(--color-ink-subtle)]">
          {step.caption}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={stepIndex === 0}
            onClick={() => {
              setPlaying(false);
              setStepIndex((current) => Math.max(0, current - 1));
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (stepIndex >= STEPS.length - 1) {
                setStepIndex(0);
                setPlaying(true);
                return;
              }
              setPlaying((current) => !current);
            }}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            <span className="ml-1.5">
              {playing
                ? "Pause"
                : stepIndex >= STEPS.length - 1
                  ? "Replay"
                  : "Play"}
            </span>
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={stepIndex === STEPS.length - 1}
            onClick={() => {
              setPlaying(false);
              setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          {STEPS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Go to step ${index + 1}`}
              onClick={() => {
                setPlaying(false);
                setStepIndex(index);
              }}
              className="h-2 w-2 rounded-full transition-all"
              style={{
                backgroundColor:
                  index === stepIndex
                    ? "var(--color-teal)"
                    : "var(--color-border-strong)",
                width: index === stepIndex ? 18 : 8,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
