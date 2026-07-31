export function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded-full bg-[var(--color-surface-soft)]" />
      <div className="h-32 animate-pulse rounded-[28px] bg-[var(--color-surface-soft)]" />
      <div className="h-48 animate-pulse rounded-[28px] bg-[var(--color-surface-soft)]" />
    </div>
  );
}
