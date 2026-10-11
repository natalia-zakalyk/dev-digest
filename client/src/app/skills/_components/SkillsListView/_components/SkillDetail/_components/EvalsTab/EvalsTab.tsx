/* EvalsTab — placeholder: the Evals feature isn't built yet. */
"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

export function EvalsTab() {
  const t = useTranslations("skills");
  return <EmptyState icon="FlaskConical" title={t("evalsTab.title")} body={t("evalsTab.body")} />;
}
