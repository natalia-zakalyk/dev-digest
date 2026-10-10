/* NotFoundView — 404 screen inside the app shell, with a way back home. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";

export function NotFoundView() {
  const t = useTranslations("common");
  const router = useRouter();
  return (
    <AppShell crumb={[{ label: t("errors.notFoundTitle") }]}>
      <EmptyState
        icon="Search"
        title={t("errors.notFoundTitle")}
        body={t("errors.notFoundBody")}
        cta={t("errors.goHome")}
        onCta={() => router.push("/")}
      />
    </AppShell>
  );
}
