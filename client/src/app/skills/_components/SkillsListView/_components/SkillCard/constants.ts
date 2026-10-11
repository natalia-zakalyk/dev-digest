import type { IconName } from "@devdigest/ui";
import type { SkillSource } from "@devdigest/shared";

/** Icon next to the source label on a skill card. */
export const SOURCE_ICONS: Record<SkillSource, IconName> = {
  manual: "Edit",
  extracted: "WandSparkles",
  community: "Globe",
  imported_url: "Link",
  imported_file: "Link",
};
