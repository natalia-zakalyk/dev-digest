/* BodyEditor — the skill body as a code-style editor: file-name header (`<name>.md`), "unsaved" badge,
   token count and a line-number gutter that scrolls with the text. Spec: client/specs/skills.md */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { estimateTokens } from "@/lib/estimate-tokens";
import { s } from "./styles";

export function BodyEditor({
  fileName,
  value,
  dirty,
  onChange,
}: {
  fileName: string;
  value: string;
  dirty: boolean;
  onChange: (next: string) => void;
}) {
  const t = useTranslations("skills");
  const gutter = React.useRef<HTMLDivElement>(null);
  const lines = value.split("\n").length;

  return (
    <div style={s.box}>
      <div style={s.head}>
        <Icon.FileText size={14} />
        <span className="mono" style={s.file}>
          {fileName}
        </span>
        {dirty && <span style={s.unsaved}>{t("config.unsaved")}</span>}
        <span className="mono tnum" style={s.tokens}>
          {t("config.tokens", { count: estimateTokens(value) })}
        </span>
      </div>
      <div style={s.editor}>
        <div ref={gutter} aria-hidden style={s.gutter}>
          {Array.from({ length: lines }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          className="mono"
          aria-label={t("config.body")}
          value={value}
          wrap="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
          }}
          style={s.textarea}
        />
      </div>
    </div>
  );
}
