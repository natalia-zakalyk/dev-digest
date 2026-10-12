# Spec — Conventions (UI)

Status: implemented (server + UI) · Lab L02 (extension) · Server side: [server/specs/conventions.md](../../server/specs/conventions.md)

## `/conventions` page (sidebar: Skills Lab → Conventions)
- Header "Conventions in `<repo>`", subline "Detected from N sample files · last scan 1h ago", **Re-scan** button
  (`POST /repos/:id/conventions/extract`; spinner + disabled while running).
- Toolbar: Select all / Deselect all · "K of N accepted" · primary **Create skill** (disabled at K = 0).
- Candidate card: rule title (inline-editable via pencil → `PATCH /conventions/:id`), category chip, evidence
  `path:start-end` (copy button) + code snippet, confidence bar (green ≥ 85, amber 60–84, red below), buttons
  **Accept / Reject** (toggle, `PATCH status`). Rejected cards collapse/dim; filter chips: All · Pending · Accepted · Rejected · by category.
- **States:** never scanned → `EmptyState` with "Scan repository" · scanning → skeletons · error → `ErrorState` + Retry ·
  scan finished with 0 verified → "No verifiable conventions found" + dropped count.

## Create-skill modal
- Opens from **Create skill**; data from `POST /repos/:id/conventions/skill-draft` (accepted ids).
- Banner "Merged from N accepted conventions in `<repo>`. Everything below is editable before you save."
- Fields: Name (required) · Description · Type (default `convention`) · Enabled · Skill body (markdown editor, token count,
  `unsaved` badge) — reuse `SkillEditorModal` pieces rather than a second editor.
- Footer: **Cancel** (writes nothing) · **Create skill** → `POST /skills` (`source: 'extracted'`), then optional
  "Link to agents" step → `POST /agents/:id/skills`; toast + link to the new skill.

## Implementation notes
- Built: page `repos/[repoId]/conventions` (`ConventionsView` → `ConventionCard`, `SkillDraftModal`), hooks `lib/hooks/conventions.ts`,
  nav item "Conventions" (`g c`) in `vendor/ui/nav.ts`, namespace `messages/en/conventions.json`.
- Deferred from v1: category filter chips (status filter only) and the optional "Link to agents" step after saving —
  link the new skill via the agent editor's Skills tab for now. "Select all" patches each card (N requests).
- Route `client/src/app/repos/[repoId]/conventions/page.tsx`, components in `_components/` (PascalCase folders + barrel),
  hooks `useConventions / useExtractConventions / useUpdateConvention / useSkillDraft` in `client/src/lib/hooks/`.
- i18n namespace `messages/en/conventions.json` (camelCase keys); shared strings in `common`.
- **Do not value-import from `@devdigest/shared`** (breaks Next bundler) — `import type` only; copy enums to a local constant.
- Load `next-best-practices` and `frontend-ui-architecture` skills before building. Tests colocated `<Name>.test.tsx`.
