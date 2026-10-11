import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import common from "../../../../../../../messages/en/common.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "over-mocking",
  description: "Use when tests call vi.mock.",
  type: "convention",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 2,
};

function renderCard(props: Partial<React.ComponentProps<typeof SkillCard>> = {}) {
  const onOpen = vi.fn();
  const onToggle = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages, common }}>
      <SkillCard skill={SKILL} onOpen={onOpen} onToggle={onToggle} {...props} />
    </NextIntlClientProvider>,
  );
  return { onOpen, onToggle };
}

describe("SkillCard", () => {
  it("shows name, type, description and source", () => {
    renderCard();
    expect(screen.getByRole("button", { name: "over-mocking" })).toBeInTheDocument();
    expect(screen.getByText("convention")).toBeInTheDocument();
    expect(screen.getByText("Use when tests call vi.mock.")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("shows usage numbers from the summary", () => {
    renderCard({ summary: { skill_id: "s1", agents_count: 3, pull_frequency: 71.2, accept_rate: 74 } });
    const footer = screen.getByTestId("skill-card-summary");
    expect(footer).toHaveTextContent("3 agents");
    expect(footer).toHaveTextContent("71% pull");
    expect(screen.getByText("74% accept")).toBeInTheDocument();
  });

  it("uses the singular for one agent and omits null rates", () => {
    renderCard({ summary: { skill_id: "s1", agents_count: 1, pull_frequency: null, accept_rate: null } });
    const footer = screen.getByTestId("skill-card-summary");
    expect(footer).toHaveTextContent("1 agent");
    expect(footer).not.toHaveTextContent("pull");
    expect(footer).not.toHaveTextContent("accept");
  });

  it("shows a dash without a summary", () => {
    renderCard();
    expect(screen.getByTestId("skill-card-summary")).toHaveTextContent("—");
  });

  it("selects on click and toggles enabled separately", () => {
    const { onOpen, onToggle } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "over-mocking" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
