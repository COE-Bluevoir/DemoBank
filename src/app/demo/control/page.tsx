import { notFound } from "next/navigation";

import { DemoAuthForm } from "@/components/demo-auth-form";
import { DemoControlPanel } from "@/components/demo-control-panel";
import { BankHeader } from "@/components/bank-header";
import { getDemoSettings, getScenarioOptions } from "@/lib/onboarding/engine";
import { getDemoControlEnabled, isDemoAuthorized } from "@/lib/onboarding/demo-auth";
import { loadCurrentCase } from "@/lib/onboarding/current-case";

export default async function DemoControlPage({
  searchParams,
}: {
  searchParams: Promise<{ caseId?: string }>;
}) {
  if (!getDemoControlEnabled()) {
    notFound();
  }

  if (!(await isDemoAuthorized())) {
    return (
      <div className="min-h-screen">
        <BankHeader />
        <main className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
          <div className="mx-auto max-w-xl">
            <DemoAuthForm />
          </div>
        </main>
      </div>
    );
  }

  const { caseId } = await searchParams;
  const { caseView, events } = await loadCurrentCase(caseId);

  return (
    <div className="min-h-screen">
      <BankHeader />
      <main className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <DemoControlPanel
          initialCase={caseView}
          initialEvents={events}
          settings={getDemoSettings()}
          scenarioOptions={getScenarioOptions()}
        />
      </main>
    </div>
  );
}
