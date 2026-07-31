import { Badge } from "@/components/ui";

export function CaseReferenceBadge({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
        {label}
      </span>
      <Badge>{value}</Badge>
    </div>
  );
}
