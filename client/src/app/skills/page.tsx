import { SkillsListView } from "./_components/SkillsListView";

/* Route: /skills (Skills page, L02). Thin route entry — the grid, detail panel,
   edit modal and the Add skill modal are colocated under _components/SkillsListView.
   Spec: client/specs/skills.md */
export default function SkillsPage() {
  return <SkillsListView />;
}
