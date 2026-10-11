# Spec — Skills (UI)

Status: implemented · Lab L02 · Server side: [server/specs/skills.md](../../server/specs/skills.md)

## `/skills` — Skills page (sidebar: Skills)
- **Data:** `useSkills()` → `GET /skills`; `useSkillSummaries()` → `GET /skills/summary` (card footer); `useUpdateSkill` (enable toggle) `PUT /skills/:id`;
  `useCreateSkill` `POST /skills`; `useDeleteSkill` `DELETE /skills/:id`; `useImportSkillPreview`
  `POST /skills/import/preview`.
- **Master-detail:** left column = "Skills" + "Add Skill ▾", full-width search, cards (type-coloured icon, name,
  "Enabled" toggle = global master switch, description, type badge + source with icon — Manual / Extracted /
  Community / Imported — and a footer "N agents · P% pull · A% accept" (accept in green; rates omitted when null,
  "—" while the summary is missing)); right = detail panel of the selected skill (first one auto-selected).
- **Detail tabs** (header: type-coloured icon, name, type badge, `vN` pill, disabled "Run on evals" button —
  title "Coming soon"). Order: Config · Preview · Evals · Stats · Versions:
  - *Config* — source, enabled switch, description, "external instructions" note for imported skills; Edit / Delete.
  - *Preview* — body rendered as Markdown, as the reviewing agent receives it.
  - *Stats* — `useSkillStats` → `GET /skills/:id/stats`: Used by · Pull frequency · Accept rate · Findings (30d),
    agents list (link to `/agents/:id`), findings-by-category donut.
  - *Versions* — `useSkillVersions` → `GET /skills/:id/versions`: list newest first, "Current" pill; **Diff**
    (client-side line diff vs current) and **Restore** (confirm → `PUT` with that body → new version).
    Row title = the version's `change_note`, else "Initial version" / "N added · M removed lines vs vX".
    Restore sends `change_note: "Restored from vN"`.
  - *Evals* — stub tab ("Evals are coming soon"); the feature is not built yet.
  - Preview renders markdown headings / lists via the shared `Markdown` primitive (h1–h4, ul/ol styled there).
- **Add skill ▾** → *Create* (editor modal) or *Import* (import drawer).
- **States:** loading → skeletons · error → `ErrorState` + Retry · empty → `EmptyState` with the add actions.

## Skill editor (modal, create + edit)
- Fields: name (required), description, type (`rubric | convention | security | custom`), body
  (markdown, mono textarea with Write / Preview switch, required).
- Editing shows an optional "Change note" input; it is sent as `change_note` only when the body changed.
- Hint under description: the description is the skill's interface — write it as a directive
  ("Use when…", "Check that…").

## Import (drawer)
1. Pick a `.md` or `.zip` (≤ 2 MB) → file is sent base64 to the preview endpoint.
2. Preview: editable name / description / type, rendered body, warnings, **ignored files** list
   ("not executed, not stored"), trust banner.
3. **Save** creates the skill (`source: imported_file`); **Cancel** writes nothing.

## `/agents/:id?tab=skills` — Agent editor · Skills tab
- Header "N of M enabled", filter input, hint "Order matters — earlier skills appear earlier in the
  assembled prompt".
- Rows: linked skills first in link order, then the rest. Checkbox = link / unlink (= enabled for
  this agent). Linked rows have a drag handle (native HTML5 drag-and-drop) and support
  Alt + ↑ / ↓ from the keyboard. Globally disabled skills are muted with "Disabled globally — not in prompt".
- Every change saves immediately via `POST /agents/:id/skills {skill_ids}`.
- Agent cards show "N skills" (`Agent.skills_count`).

## Run trace
Prompt assembly's Skills block lists the skill names and `~T tokens` when the trace has them.
