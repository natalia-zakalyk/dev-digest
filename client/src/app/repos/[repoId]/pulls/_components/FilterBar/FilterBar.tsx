/* FilterBar — search box, status chips, sort select, and refresh for the PR list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Chip, Button, TextInput, SelectInput } from "@devdigest/ui";
import { STATUS_FILTERS, SORT_ORDERS, type SortOrder } from "../../constants";
import { s } from "../../styles";

export function FilterBar({
  active,
  onActive,
  query,
  onQuery,
  sort,
  onSort,
  onRefresh,
  refreshing,
}: {
  active: string;
  onActive: (k: string) => void;
  query: string;
  onQuery: (v: string) => void;
  sort: SortOrder;
  onSort: (v: SortOrder) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const t = useTranslations("prReview");
  const sortOptions = SORT_ORDERS.map((value) => ({ value, label: t(`list.sort.${value}`) }));
  const handleSort = (v: string) => {
    const next = SORT_ORDERS.find((o) => o === v);
    if (next) onSort(next);
  };
  return (
    <div style={s.filterBar}>
      <div style={s.filterChips}>
        <div style={s.filterSearch}>
          <TextInput value={query} onChange={onQuery} placeholder={t("list.filterPlaceholder")} />
        </div>
        {STATUS_FILTERS.map(({ key, labelKey }) => (
          <Chip key={key} active={active === key} onClick={() => onActive(key)}>
            {t(`list.filter.${labelKey}`)}
          </Chip>
        ))}
      </div>
      <div style={s.filterActions}>
        <SelectInput value={sort} onChange={handleSort} options={sortOptions} mono={false} />
        <Button
          kind="secondary"
          size="sm"
          icon="RefreshCw"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? t("list.refreshing") : t("list.refresh")}
        </Button>
      </div>
    </div>
  );
}
