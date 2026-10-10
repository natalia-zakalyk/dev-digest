import type { Metadata } from "next";
import { NotFoundView } from "./_components/NotFoundView";

/* 404 for unknown routes and `notFound()` calls (e.g. an unknown settings
   section). Thin server entry; the screen is the client NotFoundView. */
export const metadata: Metadata = { title: "Page not found · DevDigest" };

export default function NotFound() {
  return <NotFoundView />;
}
