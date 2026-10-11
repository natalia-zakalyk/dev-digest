import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import common from "../../../../../../../../messages/en/common.json";

const skill = (id: string, name: string, over: Partial<Skill> = {}): Skill => ({
  id,
  name,
  description: "",
  type: "rubric",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
  ...over,
});

let SKILLS: Skill[] = [
  skill("a", "alpha"),
  skill("b", "beta", { type: "security" }),
  skill("c", "gamma", { enabled: false }),
  skill("d", "delta"),
];
const LINKS: AgentSkillLink[] = [
  { agent_id: "ag1", skill_id: "b", order: 0 },
  { agent_id: "ag1", skill_id: "c", order: 1 },
  { agent_id: "ag1", skill_id: "a", order: 2 },
];

const setMutate = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentSkills: () => ({ data: LINKS, isLoading: false, isError: false, refetch: vi.fn() }),
  useSetAgentSkills: () => ({ mutate: setMutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(cleanup);
const ORIGINAL = SKILLS;
beforeEach(() => {
  setMutate.mockReset();
  SKILLS = ORIGINAL;
});

const AGENT = { id: "ag1", name: "Test Quality Reviewer" } as Agent;

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages, common }}>
      <SkillsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

const rowNames = () =>
  screen.getAllByRole("listitem").map((li) => within(li).getAllByText(/^[a-z]+$/)[0]!.textContent);

describe("SkillsTab", () => {
  it("lists linked skills first in link order, then the rest, with the enabled count", () => {
    renderTab();
    expect(screen.getByText("3 of 4 enabled")).toBeInTheDocument();
    expect(rowNames()).toEqual(["beta", "gamma", "alpha", "delta"]);
    expect(screen.getByRole("checkbox", { name: "beta" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: "delta" })).toHaveAttribute("aria-checked", "false");
  });

  it("marks a globally disabled skill as not in the prompt", () => {
    renderTab();
    expect(within(screen.getByTestId("skill-row-gamma")).getByText(/Disabled globally/)).toBeInTheDocument();
  });

  it("link appends to the end; unlink removes", () => {
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "delta" }));
    expect(setMutate).toHaveBeenLastCalledWith(["b", "c", "a", "d"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "beta" }));
    expect(setMutate).toHaveBeenLastCalledWith(["c", "a"]);
  });

  it("reorders with Alt+Arrow on the drag handle", () => {
    renderTab();
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder alpha" }), { key: "ArrowUp", altKey: true });
    expect(setMutate).toHaveBeenLastCalledWith(["b", "a", "c"]);
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder beta" }), { key: "ArrowDown", altKey: true });
    expect(setMutate).toHaveBeenLastCalledWith(["c", "b", "a"]);
  });

  it("reorders with native drag-and-drop", () => {
    renderTab();
    const dataTransfer = { setData: vi.fn(), effectAllowed: "" };
    fireEvent.dragStart(screen.getByTestId("skill-row-alpha"), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId("skill-row-beta"), { dataTransfer });
    fireEvent.drop(screen.getByTestId("skill-row-beta"), { dataTransfer });
    expect(setMutate).toHaveBeenLastCalledWith(["a", "b", "c"]);
  });

  it("filters rows", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "security" } });
    expect(rowNames()).toEqual(["beta"]);
  });

  it("empty state links to the Skills page", () => {
    SKILLS = [];
    renderTab();
    expect(screen.getByRole("link", { name: messages.skills.emptyCta })).toHaveAttribute("href", "/skills");
  });
});
