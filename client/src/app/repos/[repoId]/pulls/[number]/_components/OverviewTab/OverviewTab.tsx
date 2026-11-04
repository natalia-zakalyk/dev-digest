"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { IntentCard } from "./_components/IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string;
  repoId: string;
  repoFullName: string | null;
  headSha: string;
  prBody: string | null | undefined;
}

export function OverviewTab({ prId, repoId, repoFullName, headSha, prBody }: OverviewTabProps) {
  return (
    <>
      <div style={s.cardsRow}>
        <div style={s.cardCell}>
          <IntentCard prId={prId} />
        </div>
        <div style={s.cardCell}>
          <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
        </div>
      </div>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
