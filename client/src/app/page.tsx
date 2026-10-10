import type { Metadata } from "next";
import { HomeView } from "./_components/HomeView";

/* Route: / — thin server entry. HomeView redirects to the first repo's PR list
   or offers onboarding when there are no repos. */
export const metadata: Metadata = { title: "DevDigest" };

export default function HomePage() {
  return <HomeView />;
}
