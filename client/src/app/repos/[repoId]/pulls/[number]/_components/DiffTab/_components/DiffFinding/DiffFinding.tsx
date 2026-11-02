"use client";

import React from "react";
import type { FindingRecord } from "@devdigest/shared";
import { useFindingAction } from "@/lib/hooks/reviews";
import { FindingCard } from "../../../FindingCard";

/** The Agent-runs FindingCard under a diff line, wired to accept/dismiss. */
export function DiffFinding({
  finding,
  prId,
  repoFullName,
  headSha,
}: {
  finding: FindingRecord;
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const { mutate, isPending } = useFindingAction();
  return (
    <FindingCard
      f={finding}
      defaultExpanded
      repoFullName={repoFullName}
      headSha={headSha}
      pending={isPending}
      onAction={(action) => mutate({ findingId: finding.id, action, prId })}
    />
  );
}
