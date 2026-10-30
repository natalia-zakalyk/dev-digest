# Spec — Intent card (PR Overview tab)

Status: implemented (L03). Server behaviour: [../../server/specs/intent-layer.md](../../server/specs/intent-layer.md).

## Placement
`OverviewTab` renders the `IntentCard` **full width** above the description (Blast Radius does not exist yet; when it
does, the card moves into a 2-column row). `PrDetailView` passes `prId`.

## Data
`lib/hooks/intent.ts`: `usePrIntent(prId)` -> `GET /pulls/:id/intent` (key `["pr-intent", prId]`);
`useDeriveIntent(prId)` -> `POST /pulls/:id/intent` `{force?}`, writes the response into the cache.
`useInvalidatePrRuns.runSettled` also invalidates `["pr-intent", prId]` so the card updates after a run.

## States (`IntentCard`)
| State | UI |
|---|---|
| loading | muted "Loading intent..." (`aria-busy`) |
| error | muted inline text (5xx also toast through the global policy) |
| empty (`intent: null`) | explanation + **Derive intent** button (POST) |
| loaded | blockquote with the intent; IN SCOPE / OUT OF SCOPE lists (an empty out-of-scope shows "Nothing explicitly excluded."); RISK AREAS badges; footer with confidence badge, sources ("From description · docs/plans/x.md · issue #123"), `{model} · {date}` |
| `confidence: low` | warning note "Low confidence: inferred from branch, commits and files" (icon + text, `role="note"`) |
| `stale: true` | note "The PR head moved since this intent was derived." + **Refresh** (POST `force:true`) |
| `method: heuristic` | hint "Fallback (no model)..." |

Presentation helpers (source labels, dedupe) live in `IntentCard/helpers.ts`; the confidence colours in
`IntentCard/constants.ts` (client code uses `import type` only from `@devdigest/shared`).

## i18n
Namespace `intent` (`messages/en/intent.json`), camelCase keys; `brief.json` `block.intent` is unchanged.

## Settings
The `review_intent` row in Settings > Models already renders from the registry; only its default changed
(`openrouter` / `deepseek/deepseek-v4-flash`) in `lib/feature-models.ts`.
