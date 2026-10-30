/** Public surface of the intent module — other modules import only from here. */
export { createIntentService } from './compose.js';
export { IntentService } from './service.js';
export type { IntentLog, DeriveResult, ClassifierPromptMeta } from './service.js';
export { renderableIntent } from './helpers.js';
