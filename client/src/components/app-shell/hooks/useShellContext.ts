"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ShellContext } from "@devdigest/ui";
import type { ConfirmDialogProps } from "@/components/confirm-dialog";
import { useTheme } from "@/lib/theme";
import { useActiveRepo } from "@/lib/repo-context";
import { usePulls, useDeleteRepo } from "@/lib/hooks/core";
import { activeKeyFor, toShellRepo } from "../helpers";

interface ShellContextOptions {
  onOpenCommandPalette: () => void;
}

/**
 * Assembles the `ShellContext` consumed by AppFrame: active nav key, the repo
 * list/active repo (mapped to the shell shape), theme, PR count, and the repo
 * selection / add / removal actions. Removing a repo asks first: the hook also
 * returns the props for the remove-repo ConfirmDialog that AppShell renders.
 */
export function useShellContext({ onOpenCommandPalette }: ShellContextOptions): {
  ctx: ShellContext;
  removeDialog: ConfirmDialogProps;
} {
  const t = useTranslations("shell");
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { repoId, repos, activeRepo, setRepoId } = useActiveRepo();
  const { data: pulls } = usePulls(repoId);
  const deleteRepo = useDeleteRepo();

  const onSelectRepo = React.useCallback(
    (id: string) => {
      setRepoId(id);
      router.push(`/repos/${id}/pulls`);
    },
    [setRepoId, router],
  );

  const onAddRepo = React.useCallback(() => router.push("/onboarding"), [router]);

  const [pendingRemoveId, setPendingRemoveId] = React.useState<string | null>(null);
  const onRemoveRepo = React.useCallback((id: string) => setPendingRemoveId(id), []);
  const cancelRemove = React.useCallback(() => setPendingRemoveId(null), []);
  const confirmRemove = () => {
    const id = pendingRemoveId;
    if (!id) return;
    deleteRepo.mutate(id, {
      onSuccess: () => {
        if (repoId === id) {
          const next = repos.find((r) => r.id !== id);
          router.push(next ? `/repos/${next.id}/pulls` : "/onboarding");
        }
      },
      onSettled: () => setPendingRemoveId(null),
    });
  };
  const pendingRepo = pendingRemoveId ? repos.find((r) => r.id === pendingRemoveId) : undefined;
  const removeDialog: ConfirmDialogProps = {
    open: pendingRemoveId != null,
    title: t("removeRepo.title", { name: pendingRepo?.full_name ?? t("removeRepo.fallbackName") }),
    body: t("removeRepo.body"),
    confirmLabel: t("removeRepo.confirm"),
    danger: true,
    pending: deleteRepo.isPending,
    onConfirm: confirmRemove,
    onCancel: cancelRemove,
  };

  const ctx = React.useMemo<ShellContext>(
    () => ({
      Link,
      activeKey: activeKeyFor(pathname),
      repoId,
      repos: repos.map(toShellRepo),
      activeRepo: activeRepo ? toShellRepo(activeRepo) : null,
      theme,
      onToggleTheme: toggle,
      onOpenCommandPalette,
      onSelectRepo,
      onAddRepo,
      onRemoveRepo,
      // Sidebar badge = PRs that still NEED review, not the total PR count.
      // 0 → undefined so the badge hides entirely when nothing needs review.
      prCount: pulls?.filter((p) => p.status === "needs_review").length || undefined,
    }),
    [
      pathname,
      repoId,
      repos,
      activeRepo,
      theme,
      toggle,
      onOpenCommandPalette,
      onSelectRepo,
      onAddRepo,
      onRemoveRepo,
      pulls,
    ],
  );

  return { ctx, removeDialog };
}
