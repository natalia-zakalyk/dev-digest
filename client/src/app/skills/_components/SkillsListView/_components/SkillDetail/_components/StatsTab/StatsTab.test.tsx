import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillStats } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/skills.json";

let stats: SkillStats;
vi.mock("@/lib/hooks/skills", () => ({
  useSkillStats: () => ({ data: stats, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { StatsTab } from "./StatsTab";

afterEach(cleanup);

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <StatsTab skillId="s1" />
    </NextIntlClientProvider>,
  );
}

describe("StatsTab", () => {
  it("renders KPIs, agents and categories", () => {
    stats = {
      agents: [{ id: "a1", name: "Reviewer" }],
      pull_frequency: 71,
      accept_rate: 74,
      findings_30d: 96,
      findings_by_category: [{ category: "security", count: 12 }],
    } as SkillStats;
    renderTab();
    expect(screen.getByText("71")).toBeTruthy();
    expect(screen.getByText("74", { selector: "div[style*='font-size: 34px']" })).toBeTruthy();
    expect(screen.getByText("96")).toBeTruthy();
    expect(screen.getByText("Reviewer")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe("/agents/a1");
    expect(screen.getByText("security")).toBeTruthy();
  });

  it("shows a dash for null rates", () => {
    stats = { agents: [], pull_frequency: null, accept_rate: null, findings_30d: 0, findings_by_category: [] } as SkillStats;
    renderTab();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("shows empty states", () => {
    stats = { agents: [], pull_frequency: null, accept_rate: null, findings_30d: 0, findings_by_category: [] } as SkillStats;
    renderTab();
    expect(screen.getByText(messages.stats.noAgents)).toBeTruthy();
    expect(screen.getByText(messages.stats.noFindings)).toBeTruthy();
  });
});
