import Link from "next/link";

import { getIndustryPack, listProductOptions } from "@/lib/industry/registry";
import type { IndustryId } from "@/lib/industry/types";
import { Badge, Button, Card } from "@/components/ui";

/**
 * Every product this industry offers, not just the reference one — a single
 * hardcoded card read as a single-product site even though the same journey
 * already opens any of them; only `ProductIntent` and the on-page copy
 * change with which one a customer picks.
 */
export function ProductCard({
  industryId = "banking",
  ctaLabel = "Open an account",
}: {
  industryId?: IndustryId;
  ctaLabel?: string;
}) {
  const pack = getIndustryPack(industryId);
  const products = listProductOptions(pack);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {products.map((product, index) => (
        <Card key={product.code} className="flex flex-col space-y-5">
          <div className="space-y-2">
            <Badge tone={index === 0 ? "info" : "default"}>
              {product.tagline}
            </Badge>
            <h3 className="text-xl font-semibold text-[var(--color-ink)]">
              {product.name}
            </h3>
            <p className="text-sm leading-6 text-[var(--color-ink-subtle)]">
              {product.description}
            </p>
          </div>
          <div className="flex flex-1 flex-wrap items-end gap-3">
            <Link
              href={`/onboarding/start?industry=${industryId}&product=${encodeURIComponent(product.code)}`}
            >
              <Button>{ctaLabel}</Button>
            </Link>
            {industryId === "banking" && product.code === "EVERYDAY_PLUS" ? (
              <Link href="/accounts/everyday-plus">
                <Button variant="secondary">View product details</Button>
              </Link>
            ) : null}
          </div>
        </Card>
      ))}
    </div>
  );
}
