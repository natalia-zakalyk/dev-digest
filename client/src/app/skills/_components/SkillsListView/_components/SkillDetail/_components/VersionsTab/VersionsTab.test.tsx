import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/skills.json";
import common from "../../../../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

const SKILL: Skill = {
  id: "s1",
  name: "rubric",
  description: "d",
  type: "rubric",
  source: "manual",
  body: "a\nb\nc",
  enabled: true,
  version: 3,
};
const VERSIONS: SkillVersion[] = [
  { version: 3, body: "a\nb\nc", created_at: "2026-10-03T10:00:00Z", is_current: true, change_note: "Tightened scope rule" },
  { version: 2, body: "a\nx", created_at: "2026-10-02T10:00:00Z", is_current: false },
  { version: 1, body: "a", created_at: "2026-10-01T10:00:00Z", is_current: false },
];

const mutate = vi.fn();
const hook = vi.hoisted(() => ({ state: { data: undefined as unknown, isLoading: false, isError: false } }));
vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => ({ ...hook.state, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

function renderTab() {
  hook.state = { data: VERSIONS, isLoading: false, isError: false };
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages, common }}>
      <ToastProvider>
        <VersionsTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("VersionsTab", () => {
  it("renders heading, count, summaries and dates", () => {
    renderTab();
    expect(screen.getByText("Version history")).toBeInTheDocument();
    expect(screen.getByText("3 versions")).toBeInTheDocument();
    expect(screen.getByText("Initial version")).toBeInTheDocument();
    expect(screen.getByText("Tightened scope rule")).toBeInTheDocument();
    expect(screen.getByText("2026-10-03")).toBeInTheDocument();
  });

  it("shows the current pill only on the current version", () => {
    renderTab();
    expect(screen.getAllByText(/Current/)).toHaveLength(1);
    expect(within(screen.getByTestId("version-3")).getByText(/Current/)).toBeInTheDocument();
    expect(within(screen.getByTestId("version-3")).queryByRole("button")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Restore" })).toHaveLength(2);
  });

  it("toggles an inline diff against the current body", () => {
    renderTab();
    const row = screen.getByTestId("version-2");
    fireEvent.click(within(row).getByRole("button", { name: "Diff" }));
    expect(within(row).getByText("v2 → current")).toBeInTheDocument();
    expect(row.querySelectorAll('[data-kind="add"]').length).toBe(2);
    expect(row.querySelectorAll('[data-kind="del"]').length).toBe(1);
    fireEvent.click(within(row).getByRole("button", { name: "Hide diff" }));
    expect(within(row).queryByText("v2 → current")).toBeNull();
  });

  it("uses the change note as the row title, falling back to the auto summary", () => {
    renderTab();
    expect(within(screen.getByTestId("version-3")).getByText("Tightened scope rule")).toBeInTheDocument();
    expect(within(screen.getByTestId("version-1")).getByText("Initial version")).toBeInTheDocument();
    expect(within(screen.getByTestId("version-2")).getByText(/vs v1/)).toBeInTheDocument();
  });

  it("restores a version's body after confirmation", () => {
    renderTab();
    fireEvent.click(within(screen.getByTestId("version-2")).getByRole("button", { name: "Restore" }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Restore v2?")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restore" }));
    expect(mutate).toHaveBeenCalledWith({ id: "s1", patch: { body: "a\nx", change_note: "Restored from v2" } }, expect.any(Object));
  });

  it("shows an error state on failure", () => {
    hook.state = { data: undefined, isLoading: false, isError: true };
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages, common }}>
        <ToastProvider>
          <VersionsTab skill={SKILL} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Could not load versions.")).toBeInTheDocument();
  });
});
