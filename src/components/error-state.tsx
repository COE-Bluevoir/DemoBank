import { AlertTriangle } from "lucide-react";

import { Button, Card, SectionTitle } from "@/components/ui";

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="space-y-5">
      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[#FEE4E2] text-[var(--color-error)]">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <SectionTitle title={title} description={message} />
      {onRetry ? (
        <Button type="button" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </Card>
  );
}
