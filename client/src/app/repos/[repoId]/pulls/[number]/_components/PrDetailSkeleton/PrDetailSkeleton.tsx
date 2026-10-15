/* PrDetailSkeleton — loading state of the PR detail route (title, meta, body). */
import React from "react";
import { Skeleton } from "@devdigest/ui";
import { s } from "./styles";

export function PrDetailSkeleton() {
  return (
    <div style={s.root} aria-busy="true">
      <Skeleton height={28} width={420} />
      <Skeleton height={16} width={300} />
      <Skeleton height={200} />
    </div>
  );
}
