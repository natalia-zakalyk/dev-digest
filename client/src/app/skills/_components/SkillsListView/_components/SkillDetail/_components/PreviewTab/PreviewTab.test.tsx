import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/skills.json";
import { PreviewTab } from "./PreviewTab";

afterEach(cleanup);

describe("PreviewTab", () => {
  it("renders the skill body as markdown", () => {
    const skill: Skill = {
      id: "s1",
      name: "n",
      description: "",
      type: "rubric",
      source: "manual",
      body: "# Rubric title\n\nSome **body** text.",
      enabled: true,
      version: 1,
    };
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <PreviewTab skill={skill} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Rubric title" })).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });
});
