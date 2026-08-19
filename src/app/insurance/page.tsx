import type { Metadata } from "next";

import { IndustryHomepage } from "@/components/industry-homepage";
import { getIndustryPack } from "@/lib/industry/registry";

const pack = getIndustryPack("insurance");

export const metadata: Metadata = {
  title: `${pack.brand.organisationName} | ${pack.brand.productName}`,
  description: pack.objective,
};

/**
 * A static route so this shadows the generic `/[industry]` page for
 * insurance specifically — see IndustryHomepage for why this exists
 * alongside banking's bespoke front door at `/`.
 */
export default function InsuranceHomePage() {
  return <IndustryHomepage industryId="insurance" />;
}
