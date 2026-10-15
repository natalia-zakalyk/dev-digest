import type { Provider } from "@devdigest/shared";

/** Default provider/model for a new agent. */
export const DEFAULT_PROVIDER: Provider = "openai";
export const DEFAULT_MODEL = "gpt-4.1";

/** Preferred model per provider; used when the provider is switched (falls back to the provider's first listed model). */
export const PROVIDER_DEFAULT_MODEL: Record<Provider, string> = {
  openai: "gpt-4.1",
  anthropic: "claude-sonnet-4-5",
  openrouter: "deepseek/deepseek-v4-flash",
};

/** Selectable providers in the create form. */
export const PROVIDER_OPTIONS: readonly Provider[] = ["openai", "anthropic", "openrouter"];

/** Modal width (px). */
export const MODAL_WIDTH = 620;
