/* URL state for the PR detail route: `?tab` and `?trace=<runId>`, both written
   with router.replace (no history entries) — see client/specs/pages.md. */
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { DEFAULT_PR_DETAIL_TAB, isPrDetailTab, type PrDetailTab } from "./constants";

export function usePrDetailParams(repoId: string, number: string) {
  const search = useSearchParams();
  const router = useRouter();

  const rawTab = search.get("tab");
  const tab: PrDetailTab = isPrDetailTab(rawTab) ? rawTab : DEFAULT_PR_DETAIL_TAB;
  const traceRunId = search.get("trace");

  const setParam = (key: string, val: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (val == null) sp.delete(key);
    else sp.set(key, val);
    const qs = sp.toString();
    router.replace(`/repos/${repoId}/pulls/${number}${qs ? `?${qs}` : ""}`);
  };

  return {
    tab,
    traceRunId,
    setTab: (t: PrDetailTab) => setParam("tab", t),
    openTrace: (runId: string) => setParam("trace", runId),
    closeTrace: () => setParam("trace", null),
  };
}
