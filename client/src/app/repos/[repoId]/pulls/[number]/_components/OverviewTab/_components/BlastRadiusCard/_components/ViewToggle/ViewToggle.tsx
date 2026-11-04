/* ViewToggle — Tree / Graph segmented control: two buttons in a group with aria-pressed. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { BLAST_VIEWS, type BlastView } from "../../constants";
import { buttonStyle, s } from "./styles";

interface ViewToggleProps {
  value: BlastView;
  onChange: (view: BlastView) => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  const t = useTranslations("blast");
  return (
    <div role="group" aria-label={t("view.label")} style={s.group}>
      {BLAST_VIEWS.map((view) => (
        <button
          key={view}
          type="button"
          aria-pressed={value === view}
          style={buttonStyle(value === view)}
          onClick={() => onChange(view)}
        >
          {t(`view.${view}`)}
        </button>
      ))}
    </div>
  );
}
