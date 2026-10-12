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
- **Add Skill** → one modal with three tabs (see *Add skill modal*).
- **States:** loading → skeletons · error → `ErrorState` + Retry · empty → `EmptyState` with the add actions.

## Skill editor (modal, create + edit)
- Fields: name (required), description, type (`rubric | convention | security | custom`), body
  (markdown, mono textarea with Write / Preview switch, required).
- Editing shows an optional "Change note" input; it is sent as `change_note` only when the body changed.
- Hint under description: the description is the skill's interface — write it as a directive
  ("Use when…", "Check that…").

## Add skill modal (tabs: Create · From file · Import from URL)
- **Create** — Name, Description, Type, Body (Markdown, Write/Preview) → **Create skill** (`source: manual`).
- **From file** — optional Skill name ("derived from the first heading if blank"), Type, File chooser that accepts **only
  `.md` / `.zip`** (≤ 2 MB; other extensions are rejected in code, not just by `accept`). Picking a file calls
  `POST /skills/import/preview` and shows its content in an editable **Skill body** field, plus warnings and the
  **ignored files** list ("not executed, not stored") and the trust note. **Import skill** → `POST /skills`
  (`source: imported_file`); the skill appears in the list and can be linked to agents.
- **Import from URL** — `URL (https:// only)` + `Skill name`, button **Import from URL** → `POST /skills/import/url`, then
  the standard create form opens pre-filled (Name, Type, Description, Skill body; `source: imported_url`). If the preview
  has `injection.detected`, a red banner shows "INJECTION DETECTED — DO NOT ENABLE · This skill contains prompt injection
  patterns. It has been automatically blocked."; saving is still allowed.
- Cancel / close writes nothing.

## Injection detected (skill state)
- **List card:** red border + red "Injection detected" badge. **Detail:** red banner above the header ("INJECTION DETECTED —
  DO NOT ENABLE …") and the badge next to the version pill. The global Enabled toggle is untouched.
- **Agent Skills tab:** a flagged, not-linked skill shows the badge and a **disabled** link checkbox (a flagged skill that is
  already linked can still be unlinked). The server also answers 422 to linking it.
- Editing the body to remove the patterns clears all of the above on the next load (the flag is derived, not stored).

## `/agents/:id?tab=skills` — Agent editor · Skills tab
- Header "N of M enabled", filter input, hint "Order matters — earlier skills appear earlier in the
  assembled prompt".
- Rows: linked skills first in link order, then the rest. Checkbox = link / unlink (= enabled for
  this agent); disabled for skills with an injection flag (see above). Linked rows have a drag handle (native HTML5 drag-and-drop) and support
  Alt + ↑ / ↓ from the keyboard. Globally disabled skills are muted with "Disabled globally — not in prompt".
- Every change saves immediately via `POST /agents/:id/skills {skill_ids}`.
- Agent cards show "N skills" (`Agent.skills_count`).

## Run trace
Prompt assembly's Skills block lists the skill names and `~T tokens` when the trace has them.

## Lab-criteria additions
- Sidebar: **SKILLS LAB** section holds Agents · Skills · Conventions (Pull Requests stays in WORKSPACE).
- Skill card: `vN` version badge, agents count, trash button → ConfirmDialog (confirm / cancel / ×).
- Route `/skills/:id` opens the page with that skill selected; opening another card rewrites the URL (`history.replaceState`).
- Detail tabs: Config · Preview · Evals · Stats · **Versioning** (diff + restore).
