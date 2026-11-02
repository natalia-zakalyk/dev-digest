import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import shell from "../../../../messages/en/shell.json";
import common from "../../../../messages/en/common.json";
import { DiffViewer } from "./DiffViewer";
import type { DiffFindingApi } from "../findings";

afterEach(cleanup);

const FILES: PrFile[] = [
  { path: "src/a.ts", additions: 2, deletions: 0, patch: "@@ -1,1 +1,3 @@\n const a = 1;\n+const b = 2;\n+const c = 3;" },
  { path: "src/clean.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n x\n+y" },
];

const finding = (o: Partial<FindingRecord>): FindingRecord => ({
  id: "f1",
  severity: "CRITICAL",
  category: "bug",
  title: "Off by one",
  file: "src/a.ts",
  start_line: 2,
  end_line: 2,
  rationale: "r",
  confidence: 0.9,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
  ...o,
});

function Card({ f }: { f: FindingRecord }) {
  return <div data-testid={`finding-${f.id}`}>{f.title}</div>;
}

function api(list: FindingRecord[]): DiffFindingApi {
  const byPath = new Map<string, FindingRecord[]>();
  for (const f of list) byPath.set(f.file, [...(byPath.get(f.file) ?? []), f]);
  return { byPath, renderFinding: (f) => <Card f={f} /> };
}

function renderViewer(props: React.ComponentProps<typeof DiffViewer>) {
  render(
    <NextIntlClientProvider locale="en" messages={{ shell, common }}>
      <DiffViewer {...props} />
    </NextIntlClientProvider>,
  );
}

describe("DiffViewer findings", () => {
  it("shows the file dot, the finding under its line with a severity label, and an unanchored fallback", () => {
    renderViewer({
      files: FILES,
      findings: api([finding({}), finding({ id: "f2", title: "Far away", severity: "WARNING", start_line: 500 })]),
    });
    // dot only on the file with findings
    expect(screen.getAllByRole("img", { name: "Has review findings" })).toHaveLength(1);
    // anchored finding rendered under the line, with the severity label
    expect(screen.getByTestId("finding-f1")).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
    // unanchored finding lands in the always-visible fallback list
    expect(screen.getByText("Findings outside the shown lines")).toBeInTheDocument();
    expect(screen.getByTestId("finding-f2")).toBeInTheDocument();
  });

  it("shows one lowercase label per finding on a line (most severe first), INFO gets none", () => {
    renderViewer({
      files: FILES,
      findings: api([
        finding({ id: "f1", severity: "SUGGESTION", title: "Nit" }),
        finding({ id: "f2", severity: "CRITICAL", title: "Bug" }),
        finding({ id: "f3", severity: "CRITICAL", title: "Bug 2" }),
        finding({ id: "f4", severity: "INFO" as unknown as FindingRecord["severity"], title: "Fyi" }),
      ]),
    });
    const labels = ["blocker", "suggestion"].map((w) => screen.getAllByText(w).map((n) => n.textContent));
    expect(labels).toEqual([["blocker", "blocker"], ["suggestion"]]);
    expect(screen.queryByText("info")).not.toBeInTheDocument();
    expect(screen.queryByText("BLOCKER")).not.toBeInTheDocument();
  });

  it("showFindings=false hides cards, labels and the fallback list but keeps the file dot", () => {
    renderViewer({
      files: FILES,
      findings: {
        ...api([finding({}), finding({ id: "f2", title: "Far away", severity: "WARNING", start_line: 500 })]),
        showFindings: false,
      },
    });
    expect(screen.queryByTestId("finding-f1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("finding-f2")).not.toBeInTheDocument();
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
    expect(screen.queryByText("Findings outside the shown lines")).not.toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Has review findings" })).toHaveLength(1);
  });

  it("starts file cards collapsed with defaultCollapsed", () => {
    renderViewer({ files: FILES, defaultCollapsed: true });
    for (const b of screen.getAllByRole("button")) expect(b).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("const b = 2;")).not.toBeInTheDocument();
  });

  it("opens a file with findings even when defaultCollapsed, and keeps the clean one closed", () => {
    renderViewer({ files: FILES, defaultCollapsed: true, findings: api([finding({})]) });
    expect(screen.getByRole("button", { name: /src\/a\.ts/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /src\/clean\.ts/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("finding-f1")).toBeInTheDocument();
  });

  it("opens a collapsed file when its findings arrive after mount", () => {
    const view = (props: React.ComponentProps<typeof DiffViewer>) => (
      <NextIntlClientProvider locale="en" messages={{ shell, common }}>
        <DiffViewer {...props} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(view({ files: FILES, defaultCollapsed: true }));
    expect(screen.getByRole("button", { name: /src\/a\.ts/ })).toHaveAttribute("aria-expanded", "false");
    rerender(view({ files: FILES, defaultCollapsed: true, findings: api([finding({})]) }));
    expect(screen.getByRole("button", { name: /src\/a\.ts/ })).toHaveAttribute("aria-expanded", "true");
  });
});
