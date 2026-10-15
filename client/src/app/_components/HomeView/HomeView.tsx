/* HomeView — sends the user to the first repo's PR list, or shows an empty
   state that points at onboarding when there are no repos. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, Button, Skeleton } from "@devdigest/ui";
import { useRepos } from "@/lib/hooks/core";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-shell";
import { s } from "./styles";

export function HomeView() {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const { data: repos, isLoading, isError } = useRepos();
  const first = repos?.[0];

  React.useEffect(() => {
    if (first) router.replace(`/repos/${first.id}/pulls`);
  }, [first, router]);

  return (
    <AppShell crumb={[{ label: t("home.breadcrumb") }]}>
      <PageContainer title={t("home.title")} subtitle={t("home.subtitle")}>
        {isLoading ? (
          <div style={s.skeletonStack}>
            <Skeleton height={20} width={240} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </div>
        ) : isError || !first ? (
          <EmptyState
            icon="GitBranch"
            title={t("home.emptyTitle")}
            body={t("home.emptyBody")}
            cta={t("home.emptyCta")}
            onCta={() => router.push("/onboarding")}
          />
        ) : (
          <div>
            <p style={s.redirecting}>{t("home.redirecting")}</p>
            <Button kind="primary" onClick={() => router.push(`/repos/${first.id}/pulls`)}>
              {t("home.openRepo", { name: first.full_name })}
            </Button>
          </div>
        )}
      </PageContainer>
    </AppShell>
  );
}
