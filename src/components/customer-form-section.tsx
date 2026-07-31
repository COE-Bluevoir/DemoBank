import type { ReactNode } from "react";

import { Card, SectionTitle } from "@/components/ui";

export function CustomerFormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="space-y-6">
      <SectionTitle title={title} description={description} />
      {children}
    </Card>
  );
}
