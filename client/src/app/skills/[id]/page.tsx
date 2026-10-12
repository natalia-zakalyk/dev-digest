import { SkillsListView } from "../_components/SkillsListView";

/* Route: /skills/:id — the Skills page with that skill preselected (deep link; the
   list view keeps the URL in sync when another card is opened). Spec: client/specs/skills.md */
export default async function SkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SkillsListView initialId={id} />;
}
