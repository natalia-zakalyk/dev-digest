/** Constants for the PR detail route. */

/** Valid `?tab` values, in display order. */
export const PR_DETAIL_TABS = ["overview", "findings", "diff"] as const;
export type PrDetailTab = (typeof PR_DETAIL_TABS)[number];

/** Tab shown when `?tab` is missing or unknown. */
export const DEFAULT_PR_DETAIL_TAB: PrDetailTab = "overview";

export function isPrDetailTab(value: string | null | undefined): value is PrDetailTab {
  return (PR_DETAIL_TABS as readonly string[]).includes(value ?? "");
}
