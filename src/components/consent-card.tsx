"use client";

import { useForm, useWatch } from "react-hook-form";

import { CONSENT_VERSION } from "@/lib/onboarding/constants";
import type { ConsentView } from "@/lib/onboarding/types";
import { Button, Card, SectionTitle } from "@/components/ui";

export function ConsentCard({
  consentText,
  busy,
  onSubmit,
}: {
  consentText: string;
  busy?: boolean;
  onSubmit: (value: ConsentView) => void;
}) {
  const form = useForm<{ accepted: boolean }>({
    defaultValues: { accepted: false },
  });

  const accepted = useWatch({
    control: form.control,
    name: "accepted",
  });

  return (
    <Card className="space-y-6">
      <SectionTitle
        title="Consent"
        description="Review the consent statement before continuing with your application."
      />
      <div className="rounded-3xl bg-[var(--color-surface-soft)] p-5 text-sm leading-7 text-[var(--color-ink)]">
        {consentText}
      </div>
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((value) =>
          onSubmit({
            accepted: value.accepted,
            timestamp: new Date().toISOString(),
            textVersion: CONSENT_VERSION,
            channel: "WEB",
          }),
        )}
      >
        <label className="flex items-start gap-3 text-sm text-[var(--color-ink)]">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-[var(--color-border-strong)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
            {...form.register("accepted")}
          />
          <span>
            I confirm that the information I provide in this journey may be
            reviewed as part of the account-opening process.
          </span>
        </label>
        <Button disabled={!accepted || busy} type="submit">
          Continue
        </Button>
      </form>
    </Card>
  );
}
