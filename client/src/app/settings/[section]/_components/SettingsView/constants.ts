// Import the pure nav data module, NOT the `@devdigest/ui` barrel: this file is
// also imported by the server page (section guard), and the barrel pulls client
// components (class components / hooks) into the RSC graph → 500 at render.
import { SETTINGS_SECTIONS } from "@devdigest/ui/nav";

/** A settings section key from the shared nav registry. */
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["key"];

/** Default settings section when none is provided in the route. */
export const DEFAULT_SECTION: SettingsSection = "api-keys";

/** Section keys that have a bespoke implemented panel. */
export const SECTION_API_KEYS: SettingsSection = "api-keys";
export const SECTION_MODELS: SettingsSection = "models";

/** Type guard for the `:section` route param. */
export function isSettingsSection(value: string): value is SettingsSection {
  return SETTINGS_SECTIONS.some((sec) => sec.key === value);
}
