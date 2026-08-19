import type { Metadata } from "next";

import { IndustryHomepage } from "@/components/industry-homepage";
import { getIndustryPack } from "@/lib/industry/registry";

const pack = getIndustryPack("telecom");

export const metadata: Metadata = {
  title: `${pack.brand.organisationName} | ${pack.brand.productName}`,
  description: pack.objective,
};

/**
 * A static route so this shadows the generic `/[industry]` page for
 * telecom specifically — see IndustryHomepage for why this exists
 * alongside banking's bespoke front door at `/`.
 */
export default function TelecomHomePage() {
  return <IndustryHomepage industryId="telecom" />;
}
