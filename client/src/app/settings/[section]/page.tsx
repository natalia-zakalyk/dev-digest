import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsView, isSettingsSection } from "./_components/SettingsView";

/* Route: /settings/:section. Thin server entry: validates the section against
   SETTINGS_SECTIONS (unknown → 404) and renders the client SettingsView. */
export const metadata: Metadata = { title: "Settings · DevDigest" };

export default async function SettingsPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isSettingsSection(section)) notFound();
  return <SettingsView section={section} />;
}
