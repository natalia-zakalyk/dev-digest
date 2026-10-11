import type { SkillSource } from "@devdigest/shared";

/** Sources whose body was written by someone outside this workspace. */
const EXTERNAL_SOURCES: readonly SkillSource[] = ["imported_url", "imported_file", "community"];

export function isExternalSource(source: SkillSource): boolean {
  return EXTERNAL_SOURCES.includes(source);
}
