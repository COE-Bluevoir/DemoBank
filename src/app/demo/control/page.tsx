import { notFound } from "next/navigation";

import { DemoAuthForm } from "@/components/demo-auth-form";
import { DemoControlPanel } from "@/components/demo-control-panel";
import { BankHeader } from "@/components/bank-header";
import {
  getCurrentCaseEvents,
  getCurrentCaseView,
  getDemoSettings,
  getModeOptions,
  getScenarioOptions,
} from "@/lib/onboarding/engine";
import { getDemoControlEnabled, isDemoAuthorized } from "@/lib/onboarding/demo-auth";

export default async function DemoControlPage() {
  if (!getDemoControlEnabled()) {
    notFound();
  }

  const authorized = await isDemoAuthorized();

  return (
    <div className="min-h-screen">
      <BankHeader />
      <main className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        {authorized ? (
          <DemoControlPanel
            initialCase={getCurrentCaseView()}
            initialEvents={getCurrentCaseEvents()}
            settings={getDemoSettings()}
            scenarioOptions={getScenarioOptions()}
            modeOptions={getModeOptions()}
          />
        ) : (
          <div className="mx-auto max-w-xl">
            <DemoAuthForm />
          </div>
        )}
      </main>
    </div>
  );
}
