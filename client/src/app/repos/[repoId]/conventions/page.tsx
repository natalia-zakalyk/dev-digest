import type { Metadata } from "next";
import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions — thin server entry. Candidate list, filters and the
   create-skill modal live in _components/ConventionsView. Spec: client/specs/conventions.md */
export const metadata: Metadata = { title: "Conventions · DevDigest" };

export default function ConventionsPage() {
  return <ConventionsView />;
}
