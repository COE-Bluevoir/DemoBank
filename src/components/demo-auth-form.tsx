"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Card, SectionTitle, TextInput } from "@/components/ui";

export function DemoAuthForm() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  return (
    <Card className="space-y-5">
      <SectionTitle
        eyebrow="Restricted"
        title="Presenter passcode"
        description="This page is protected for the leadership demo. Enter the demo-control passcode to continue."
      />
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);

          const response = await fetch("/api/demo/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ passcode }),
          });

          if (!response.ok) {
            const payload = await response.json();
            setError(payload.message || "Passcode rejected.");
            setBusy(false);
            return;
          }

          router.refresh();
        }}
      >
        <label className="space-y-2 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Passcode</span>
          <TextInput
            type="password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
          />
        </label>
        {error ? (
          <p className="text-sm text-[var(--color-error)]">{error}</p>
        ) : null}
        <Button type="submit" disabled={busy}>
          Unlock demo control
        </Button>
      </form>
    </Card>
  );
}
