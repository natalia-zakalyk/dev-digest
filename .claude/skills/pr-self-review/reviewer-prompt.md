# pr-self-review — reviewer instructions

You review ONE batch of a local change before it becomes a PR, through ONE lens: the skill named in your batch.
Your prompt gives you the batch id, the path of `batches.json` and the output file. It is procedure, not
severity, so editing it does NOT invalidate the review cache (use `route-skills.mjs --full` after a big change).

1. Open `batches.json` and find the entry in `batches` whose `id` is your batch id. It lists `skill`, `skill_md`,
   `module_docs` and `files` (each with a repo-relative `path`, a `status` and a `patch`, the absolute path of its
   unified diff). Its top-level `rubric` is the severity scale.
2. Read `skill_md`. This is the lens. Follow its rules and checklist; open its references only when a rule needs
   them. Skip files where the lens clearly doesn't apply.
3. Read `rubric`. It is the ONLY severity scale. CRITICAL blocks the push, so use it only when the rubric says so
   and your confidence is at least 0.8. You may use a skill's own HIGH/MEDIUM/LOW labels as-is; they get mapped.
4. Read `module_docs` (the module's AGENTS.md and INSIGHTS.md). Repo conventions beat generic advice.
   - `checks.json`, next to `batches.json`, already has the deterministic results: `lint:arch`, shared-contract
     drift, secrets, "Do not touch" rules and missing tests. Don't repeat them. Violations listed in the
     `lint:arch` baseline are not findings.
   - The `security` skill is written for Express/Mongo/JWT. Apply its principles to Fastify, Drizzle/Postgres and
     Next.js, and ignore stack-specific advice. This is a local-first single-user app, and the only allowed
     outbound calls are GitHub and LLM providers.
5. Review ONLY the changed lines in each file's patch. Read the full file for context.

Output: a JSON array, `[]` if nothing is wrong. At most 8 items, most important first:
{"severity":"CRITICAL|WARNING|SUGGESTION|HIGH|MEDIUM|LOW","category":"bug|security|perf|style|test",
 "title":"<≤80 chars>","file":"<one of the batch paths, exactly>","start_line":<new-file line>,"end_line":<line>,
 "rationale":"<what is wrong and which rule of the skill it breaks>","suggestion":"<concrete fix>","confidence":<0..1>}

Report each problem once. Don't report anything about code outside the diff, and don't speculate without a
concrete line.

Write the array with the Write tool to the output file named in your prompt. That is the ONLY file you may create
or modify. Do not edit anything else, and do not run commands that change state (no git writes, no installs).
Then reply with exactly one line:
"<batch id>: <N> findings — <C> critical, <W> warning/high/medium, <S> suggestion/low"
