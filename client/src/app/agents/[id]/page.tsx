import type { Metadata } from "next";
import { AgentEditorView } from "./_components/AgentEditorView";

/* Route: /agents/:id — thin server entry for the Agent Editor (A2, L03). The
   screen (agent list, header, ?tab= editor) lives in _components/AgentEditorView. */
export const metadata: Metadata = { title: "Agent · DevDigest" };

export default function AgentEditorPage() {
  return <AgentEditorView />;
}
