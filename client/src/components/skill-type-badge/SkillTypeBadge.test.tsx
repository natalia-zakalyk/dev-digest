import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { SkillTypeBadge } from "./SkillTypeBadge";

afterEach(cleanup);

describe("SkillTypeBadge", () => {
  it("renders the translated type label", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ common }}>
        <SkillTypeBadge type="security" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("security")).toBeInTheDocument();
  });
});
