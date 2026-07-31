import { notFound } from "next/navigation";

import { BankHeader } from "@/components/bank-header";
import { OnboardingStatusView } from "@/components/onboarding-status-view";
import { fetchCaseView, serializeError } from "@/lib/onboarding/engine";

export default async function OnboardingStatusPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
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
    <div className="min-h-screen">
      <BankHeader />
      <main className="mx-auto max-w-4xl px-6 py-16 lg:px-8">
        <OnboardingStatusView initialCase={caseData} />
      </main>
    </div>
  );
}
