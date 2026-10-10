import type { Metadata } from "next";
import { PullsListView } from "./_components/PullsListView";

/* Route: /repos/:repoId/pulls — thin server entry. The list view (filters in
   ?status, search, sort) lives in _components/PullsListView. */
export const metadata: Metadata = { title: "Pull Requests · DevDigest" };

export default function PullsPage() {
  return <PullsListView />;
}
