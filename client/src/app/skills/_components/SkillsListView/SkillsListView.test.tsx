import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import common from "../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

const SKILLS: Skill[] = [
  {
    id: "s1",
    name: "uncovered-branches",
    description: "Use on every PR that changes logic.",
    type: "rubric",
    source: "manual",
    body: "# Uncovered branches",
    enabled: true,
    version: 1,
  },
  {
    id: "s2",
    name: "flaky-tests",
    description: "Use when tests touch timers.",
    type: "convention",
    source: "imported_file",
    body: "# Flaky tests",
    enabled: false,
    version: 1,
  },
];

const updateMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useSkillSummaries: () => ({
    data: [{ skill_id: "s1", agents_count: 3, pull_frequency: 71, accept_rate: 74 }],
  }),
  useSkillStats: () => ({ data: undefined, isLoading: true, isError: false }),
  useSkillVersions: () => ({ data: undefined, isLoading: true, isError: false }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useImportSkillPreview: () => ({ mutate: vi.fn(), isPending: false }),
  useImportSkillFromUrl: () => ({ mutate: vi.fn(), isPending: false }),
}));
// The shell needs routing/repo context; the page body is what we test here.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { SkillsListView } from "./SkillsListView";

afterEach(cleanup);

function renderView() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages, common }}>
      <ToastProvider>
        <SkillsListView />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillsListView", () => {
  it("renders a card per skill and filters by search", () => {
    renderView();
    expect(screen.getByRole("button", { name: "uncovered-branches" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "flaky-tests" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search skills…"), { target: { value: "timers" } });
    expect(screen.queryByRole("button", { name: "uncovered-branches" })).not.toBeInTheDocument();
  });

  it("toggles a skill globally from its card", () => {
    renderView();
    fireEvent.click(screen.getByRole("switch", { name: "Enable flaky-tests" }));
    expect(updateMutate).toHaveBeenCalledWith({ id: "s2", patch: { enabled: true } });
  });

  it("shows the selected skill's detail with its tabs, and switches on click", () => {
    renderView();
    expect(screen.getByRole("heading", { name: "uncovered-branches" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Config" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "flaky-tests" }));
    expect(screen.getByRole("heading", { name: "flaky-tests" })).toBeInTheDocument();
  });

  it("orders the tabs, disables Run on evals and stubs the Evals tab", () => {
    renderView();
    const names = ["Config", "Preview", "Evals", "Stats", "Versioning"];
    const tabs = screen.getAllByRole("button").filter((b) => names.includes(b.textContent ?? ""));
    expect(tabs.map((b) => b.textContent)).toEqual(names);
    expect(screen.getByRole("button", { name: "Run on evals" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Evals" }));
    expect(screen.getByText("Evals are coming soon")).toBeInTheDocument();
  });

  it("shows per-skill usage numbers on the cards", () => {
    renderView();
    expect(screen.getByText("74% accept")).toBeInTheDocument();
  });

  it("shows the external-instructions notice in the Config tab of an imported skill", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "flaky-tests" }));
    fireEvent.click(screen.getByRole("button", { name: "Config" }));
    expect(screen.getByText("external instructions")).toBeInTheDocument();
  });

  it("Add Skill opens one modal with the Create / From file / Import from URL tabs", () => {
    renderView();
    expect(screen.queryByText("Add skill")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Skill" }));
    expect(screen.getByText("Add skill")).toBeInTheDocument();
    for (const name of ["Create", "From file", "Import from URL"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });
});
