/* SymbolGroup — one changed symbol: collapsible row with its callers (file:line links) and the
   endpoint / cron chips. All strings from the index are untrusted: rendered as escaped text only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import type { BlastRadiusResponse } from "@/lib/types";
import { callerHref, callerLabel } from "../../helpers";
import { s } from "./styles";

type Impact = BlastRadiusResponse["downstream"][number];

interface SymbolGroupProps {
  impact: Impact;
  repoFullName: string | null;
  headSha: string;
}

export function SymbolGroup({ impact, repoFullName, headSha }: SymbolGroupProps) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(true);
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
  const bodyId = React.useId();

  return (
    <li style={s.row}>
      <button type="button" style={s.header} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
        <span style={s.name} className="mono">
          <Chevron size={14} />
          {impact.symbol}()
        </span>
        <span style={s.count}>{t("callerCount", { count: impact.callers.length })}</span>
      </button>
      <div id={bodyId} hidden={!open} style={s.body}>
        <ul style={s.callers}>
          {impact.callers.map((c) => {
            const href = callerHref(repoFullName, headSha, c);
            const label = callerLabel(c);
            return (
              <li key={`${c.file}:${c.line}:${c.name}`} style={s.caller}>
                <span style={s.callerIcon}>
                  <Icon.CornerDownRight size={12} />
                </span>
                {href ? <MonoLink href={href}>{label}</MonoLink> : <span className="mono" style={s.callerText}>{label}</span>}
              </li>
            );
          })}
        </ul>
        {(impact.endpoints_affected.length > 0 || impact.crons_affected.length > 0) && (
          <ul style={s.chips}>
            {impact.endpoints_affected.map((e) => (
              <li key={`e:${e}`} style={s.chip} aria-label={t("chip.endpoint", { value: e })}>
                <Badge icon="Globe" mono style={s.chipBadge} color="var(--accent-text)" bg="var(--accent-bg)">
                  {e}
                </Badge>
              </li>
            ))}
            {impact.crons_affected.map((c) => (
              <li key={`c:${c}`} style={s.chip} aria-label={t("chip.cron", { value: c })}>
                <Badge icon="Clock" mono style={s.chipBadge} color="var(--warn)" bg="var(--warn-bg)">
                  {c}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
