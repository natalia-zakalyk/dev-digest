/* Route-segment error boundary (Next 15: receives `reset`, not Next 16's `retry`).
   Catches render errors below the root layout, so next-intl and the app
   providers are still available here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");

  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState fullScreen title={t("errors.title")} body={t("errors.body")} onRetry={reset} />;
}
