import { SkillsListView } from "./_components/SkillsListView";

/* Route: /skills (Skills page, L02). Thin route entry — the grid, preview drawer,
   editor modal and import drawer are colocated under _components/SkillsListView.
   Spec: client/specs/skills.md */
export default function SkillsPage() {
  return <SkillsListView />;
}
