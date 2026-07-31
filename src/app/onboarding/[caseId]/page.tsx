import { notFound } from "next/navigation";

import { BankHeader } from "@/components/bank-header";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { getConsentText, serializeError, fetchCaseView } from "@/lib/onboarding/engine";

export default async function OnboardingCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const { caseId } = await params;
  const { demo } = await searchParams;
  let caseData;

  try {
    caseData = fetchCaseView(caseId);
  } catch (error) {
    const serialized = serializeError(error);
    if (serialized.statusCode === 404) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="min-h-screen pb-16">
      <BankHeader />
      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <OnboardingFlow
          initialCase={caseData}
          consentText={getConsentText()}
          presenterMode={demo === "true"}
        />
      </main>
    </div>
  );
}
