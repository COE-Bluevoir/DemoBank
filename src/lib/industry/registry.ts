import { bankingPack } from "@/lib/industry/packs/banking";
import { insurancePack } from "@/lib/industry/packs/insurance";
import { telecomPack } from "@/lib/industry/packs/telecom";
import type { IndustryId, IndustryPack } from "@/lib/industry/types";

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
