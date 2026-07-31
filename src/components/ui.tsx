"use client";

import * as React from "react";

import { cn } from "@/lib/onboarding/utils";

export function Button({
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-strong)]",
        variant === "secondary" &&
          "border border-[var(--color-border-strong)] bg-white text-[var(--color-ink)] hover:bg-[var(--color-surface-soft)]",
        variant === "ghost" &&
          "bg-transparent text-[var(--color-primary)] hover:bg-[var(--color-surface-soft)]",
        variant === "danger" &&
          "bg-[var(--color-error)] text-white hover:brightness-95",
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-[var(--color-border)] bg-white p-6 shadow-[0_14px_40px_rgba(16,42,67,0.08)]",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "default" | "success" | "warning" | "error" | "info";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        tone === "default" &&
          "bg-[var(--color-surface-soft)] text-[var(--color-ink-subtle)]",
        tone === "success" && "bg-[#D8F3E6] text-[var(--color-success)]",
        tone === "warning" && "bg-[#FFF0C7] text-[var(--color-warning)]",
        tone === "error" && "bg-[#FEE4E2] text-[var(--color-error)]",
        tone === "info" && "bg-[#DCEEFE] text-[var(--color-primary)]",
        className,
      )}
      {...props}
    />
  );
}

export function TextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-2xl border border-[var(--color-border-strong)] bg-white px-4 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[color:rgba(0,103,177,0.18)]",
        className,
      )}
      {...props}
    />
  );
}

export function SelectInput({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-12 w-full rounded-2xl border border-[var(--color-border-strong)] bg-white px-4 text-sm text-[var(--color-ink)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[color:rgba(0,103,177,0.18)]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-teal)]">
          {eyebrow}
        </p>
      ) : null}
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
          {title}
        </h2>
        {description ? (
          <p className="max-w-2xl text-sm leading-6 text-[var(--color-ink-subtle)]">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
