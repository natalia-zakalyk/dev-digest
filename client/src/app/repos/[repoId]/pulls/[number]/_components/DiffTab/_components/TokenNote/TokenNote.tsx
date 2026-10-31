"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { formatTokenCount } from "@/lib/format-cost";
import { SMART_DIFF_NEW_TOKENS } from "../../constants";
import { s } from "./styles";

/**
 * One-line cost note under the "Files changed" row: Smart Diff itself spends no
 * model tokens, what it shows is built on the tokens the last review runs spent.
 * Rendered in both orders; the host hides it when there is no review run yet.
 */
export function TokenNote({ sourceTokens }: { sourceTokens: number }) {
  const t = useTranslations("prReview.smartDiff");
  return (
    <p style={s.note}>
      <Icon.Zap size={13} aria-hidden />
      <span>
        {t("tokenNote", { newTokens: SMART_DIFF_NEW_TOKENS, tokens: formatTokenCount(sourceTokens) })}
      </span>
    </p>
  );
}
