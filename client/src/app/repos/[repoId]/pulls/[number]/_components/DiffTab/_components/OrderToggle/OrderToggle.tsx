"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { DIFF_ORDERS, type DiffOrder } from "../../constants";

const LABEL_KEY = { smart: "orderSmart", original: "orderOriginal" } as const satisfies Record<DiffOrder, string>;

export function OrderToggle({ order, onChange }: { order: DiffOrder; onChange: (o: DiffOrder) => void }) {
  const t = useTranslations("prReview.smartDiff");
  return (
    <div role="group" aria-label={t("orderLabel")} style={{ display: "flex", gap: 4 }}>
      {DIFF_ORDERS.map((o) => (
        <Button
          key={o}
          kind={order === o ? "secondary" : "ghost"}
          size="sm"
          aria-pressed={order === o}
          onClick={() => onChange(o)}
        >
          {t(LABEL_KEY[o])}
        </Button>
      ))}
    </div>
  );
}
