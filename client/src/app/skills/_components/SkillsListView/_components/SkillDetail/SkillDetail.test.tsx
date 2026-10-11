import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import common from "../../../../../../../messages/en/common.json";
import { ToastProvider } from "@/lib/toast";

// Only the data hooks are mocked — the real Config / Stats / Versions tabs render.
vi.mock("@/lib/hooks/skills", () => ({
  useSkillStats: () => ({
    data: {
      agents: [{ id: "a1", name: "Security Reviewer" }],
      pull_frequency: 71,
      accept_rate: 74,
      findings_30d: 96,
      findings_by_category: [{ category: "security", count: 52 }],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSkillVersions: () => ({
    data: [
      { version: 2, body: "# Preview heading", created_at: "2026-05-30T00:00:00Z", is_current: true, change_note: "Tightened scope rule" },
      { version: 1, body: "# Old", created_at: "2026-03-02T00:00:00Z", is_current: false, change_note: null },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillDetail } from "./SkillDetail";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "uncovered-branches",
  description: "d",
  type: "rubric",
  source: "manual",
  body: "# Preview heading",
  enabled: true,
  version: 2,
};

function renderDetail() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages, common }}>
      <ToastProvider>
        <SkillDetail skill={SKILL} onEdit={vi.fn()} onDeleted={vi.fn()} onToggle={vi.fn()} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillDetail", () => {
  it("opens on the Preview tab", () => {
    renderDetail();
    expect(screen.getByRole("heading", { name: "Preview heading" })).toBeInTheDocument();
    // The Config tab's real "Edit" button must not be on screen yet.
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it.each([
    ["Config", "Edit"],
    ["Stats", "Security Reviewer"],
    ["Versions", "Tightened scope rule"],
  ])("clicking %s renders that tab's real content", (label, text) => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Preview heading" })).not.toBeInTheDocument();
  });

  it("shows the Evals placeholder tab", () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: messages.detail.tabs.evals }));
    expect(screen.getByText(messages.evalsTab.title)).toBeInTheDocument();
  });

  it("keeps Run on evals disabled", () => {
    renderDetail();
    expect(screen.getByRole("button", { name: messages.detail.runOnEvals })).toBeDisabled();
  });
});
