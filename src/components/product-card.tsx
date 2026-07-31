import Link from "next/link";

import { BRAND } from "@/lib/onboarding/constants";
import { Badge, Button, Card } from "@/components/ui";

export function ProductCard() {
  return (
    <Card className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Badge tone="info">Recommended for salary and everyday banking</Badge>
          <h3 className="text-2xl font-semibold text-[var(--color-ink)]">
            {BRAND.productName}
          </h3>
          <p className="max-w-xl text-sm leading-6 text-[var(--color-ink-subtle)]">
            A premium everyday account experience built for salary credits,
            secure digital payments and regulated onboarding clarity.
          </p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-[var(--color-surface-soft)] p-4">
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            Guided onboarding
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-ink-subtle)]">
            Structured forms with an embedded assistant and clear progress.
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--color-surface-soft)] p-4">
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            Secure document capture
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-ink-subtle)]">
            Upload identity and address documents with clear progress and
            validation checks.
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--color-surface-soft)] p-4">
          <p className="text-sm font-semibold text-[var(--color-ink)]">
            Clear review updates
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-ink-subtle)]">
            Stay informed if your application needs an additional review step.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/accounts/everyday-plus">
          <Button>View product details</Button>
        </Link>
        <Link href="/onboarding/start">
          <Button variant="secondary">Open an account</Button>
        </Link>
      </div>
    </Card>
  );
}
