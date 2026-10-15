import type { Metadata } from "next";
import { AddRepoView } from "./_components/AddRepoView";

/* Route: /onboarding — thin server entry; the add-repository screen lives in
   _components/AddRepoView. */
export const metadata: Metadata = { title: "Add a repository · DevDigest" };

export default function AddRepoPage() {
  return <AddRepoView />;
}
