# Spec — Skills (server side)

Status: implemented · Lab L02 · UI side: [client/specs/skills.md](../../client/specs/skills.md)

## Goal
A **skill** is a reusable, text-only block of review instructions (name · description · type · markdown
body) shared across agents. The DB is the source of truth. Skills never execute anything: no scripts,
no tools — only their text reaches the prompt.

## Data (tables exist since 0000; `skill_versions.change_note` added in 0013)
- `skills` — workspace-scoped; `enabled` is the **global master switch**; `version` starts at 1.
- `skill_versions(skill_id, version, body, change_note?)` — immutable body snapshot (optional ≤200-char note from `CreateSkillBody`/`UpdateSkillBody.change_note`; null when omitted; ignored on metadata-only updates), written on create (v1) and on
  every body change (version + 1, same transaction).
- `agent_skills(agent_id, skill_id, order)` — a row = the skill is **linked = enabled for that agent**.
  No per-link flag: unlinking is how an agent turns a skill off. `order` ascending = prompt order.
- `source` adds `imported_file` (text column, enum enforced only in Drizzle/Zod → no migration).

## API (`server/src/modules/skills/`)
| Method | Path | Notes |
|---|---|---|
| GET | `/skills` | workspace skills, newest first |
| GET | `/skills/:id` | 404 outside the workspace |
| POST | `/skills` | `CreateSkillBody` → 201; snapshots v1 |
| PUT | `/skills/:id` | `UpdateSkillBody`; body change → version + 1 + snapshot; `enabled` alone doesn't bump |
| GET | `/skills/:id/versions` | `SkillVersion[]` newest first (`is_current` marks the live one); restore = `PUT` with an old body → new version |
| GET | `/skills/summary` | `SkillSummary[]` for every workspace skill: `agents_count`, `pull_frequency`, `accept_rate` (same 30-day definitions as `stats`); registered before `/skills/:id` |
| GET | `/skills/:id/stats` | `SkillStats`, last 30 days: linked agents, pull frequency (runs whose trace `skills_used` has the skill ÷ finished runs of linked agents), accept rate (accepted ÷ accepted+dismissed findings of those runs), findings total + by category; rates `null` without data |
| DELETE | `/skills/:id` | cascades links + versions |
| POST | `/skills/import/preview` | `SkillImportRequest {filename, content_base64}` → `SkillImportPreview`; **writes nothing** |

Agent side (`modules/agents`): `GET/POST /agents/:id/skills` (`{skill_ids}` = replace ordered set).
Every skill id must belong to the agent's workspace, otherwise 422. `Agent.skills_count` = linked count.

## Import
- `.md` → frontmatter (`name`, `description`, optional `type`) + body. No frontmatter → name from the
  first `# H1` (else the file name) and a warning; description empty + warning.
- `.zip` → only `SKILL.md` (root or one folder deep, case-insensitive) is decompressed and parsed.
  Every other entry (scripts, binaries, references, …) is **listed** in `ignored_files` and never
  decompressed, stored or executed.
- Limits: request ≤ 2 MB, ≤ 200 zip entries, `SKILL.md` ≤ 256 KB uncompressed, body non-empty.
  Violations → 422 `validation_error`.
- Saving is a separate `POST /skills` after the user confirms the preview.
- Trust: an imported skill is someone else's instructions inside our agent's prompt. The UI shows a
  warning; the engine's `INJECTION_GUARD` still applies.

## Prompt assembly (run executor)
- Per agent: linked skills **with `skills.enabled = true`**, ordered by `agent_skills.order`.
- Each block: `### <name>\n_<description>_\n\n<body>`, passed as `ReviewInput.skills` → reviewer-core
  renders `## Skills / rules` in the user message (empty list → section omitted).
- Live log: `skills: N attached (a, b) · ~T tokens` (or `skills: none attached`).
- Trace: `prompt_assembly.skills` (the block), `skills_used: [{id, name, version}]`, `skills_tokens` —
  both new fields `.nullish()` (older traces lack them).

## Acceptance criteria
1. CRUD works and is workspace-scoped; body edit bumps version and writes `skill_versions`.
2. Import preview of a zip with `SKILL.md` + `scripts/x.sh` returns the core and lists `scripts/x.sh`
   as ignored; nothing is written to the DB.
3. A globally disabled skill never reaches the prompt even when linked; an enabled linked one appears
   as its own block in `prompt_assembly.skills`, in link order.
