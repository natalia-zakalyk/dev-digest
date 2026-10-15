/* Root error boundary: replaces the root layout when it (or a provider) throws,
   so it renders its own <html>/<body> and has no NextIntlClientProvider. Strings
   are read statically from the `common` messages instead of a next-intl hook. */
"use client";

import React from "react";
import { ErrorState } from "@devdigest/ui";
import common from "../../messages/en/common.json";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" data-theme="dark">
      <body>
        <ErrorState fullScreen title={common.errors.title} body={common.errors.body} onRetry={reset} />
      </body>
    </html>
  );
}
