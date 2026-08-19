import { bankingPack } from "@/lib/industry/packs/banking";
import { insurancePack } from "@/lib/industry/packs/insurance";
import { telecomPack } from "@/lib/industry/packs/telecom";
import type { IndustryId, IndustryPack, ProductOption } from "@/lib/industry/types";

/**
 * Industry pack registry.
 *
 * Packs are declared, never derived at runtime: an industry's behaviour is a
 * reviewed configuration artefact, not something inferred per request.
 */
const PACKS: Record<IndustryId, IndustryPack> = {
  banking: bankingPack,
  insurance: insurancePack,
  telecom: telecomPack,
};

/** Banking is the reference implementation and the default experience. */
export const DEFAULT_INDUSTRY: IndustryId = "banking";

export function isIndustryId(value: string): value is IndustryId {
  return value in PACKS;
}

export function getIndustryPack(id: IndustryId): IndustryPack {
  return PACKS[id];
}

/**
 * Resolve an industry from untrusted input, falling back to the default.
 *
 * Used for route segments, so an unknown industry renders the reference
 * experience rather than failing.
 */
export function resolveIndustryPack(value: string | undefined): IndustryPack {
  return getIndustryPack(
    value && isIndustryId(value) ? value : DEFAULT_INDUSTRY,
  );
}

/** Launcher listing, reference implementation first. */
export function listIndustryPacks(): IndustryPack[] {
  return [bankingPack, insurancePack, telecomPack];
}

/** Every product a pack offers, or its single default if it declares none. */
export function listProductOptions(pack: IndustryPack): readonly ProductOption[] {
  if (pack.products && pack.products.length > 0) {
    return pack.products;
  }

  return [
    {
      code: pack.productOrServiceCode,
      name: pack.brand.productName,
      tagline: pack.brand.tagline,
      description: pack.objective,
    },
  ];
}

/**
 * The display name for a chosen product, falling back to the pack's own
 * default whenever `productCode` doesn't match a declared option — an
 * unrecognised code (an old link, a typo) degrades to the reference product
 * rather than showing a blank or throwing.
 */
export function resolveProductName(pack: IndustryPack, productCode: string): string {
  return (
    pack.products?.find((option) => option.code === productCode)?.name ??
    pack.brand.productName
  );
}
