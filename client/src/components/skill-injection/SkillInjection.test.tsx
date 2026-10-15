import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { InjectionBadge, InjectionBanner } from ".";

afterEach(cleanup);

const FLAGGED = { detected: true, reasons: ["Instruction override", "Verdict manipulation"] };
const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("InjectionBadge", () => {
  it("shows the red label with the reasons as a tooltip", () => {
    wrap(<InjectionBadge injection={FLAGGED} />);
    expect(screen.getByText("Injection detected")).toHaveAttribute("title", "Instruction override\nVerdict manipulation");
  });
  it("renders nothing for a clean or unscanned skill", () => {
    const { container } = wrap(
      <>
        <InjectionBadge injection={{ detected: false, reasons: [] }} />
        <InjectionBadge />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("InjectionBanner", () => {
  it("is an alert with the title, body and every reason", () => {
    wrap(<InjectionBanner injection={FLAGGED} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("INJECTION DETECTED — DO NOT ENABLE");
    expect(alert).toHaveTextContent("This skill contains prompt injection patterns. It has been automatically blocked.");
    expect(alert).toHaveTextContent("Instruction override");
    expect(alert).toHaveTextContent("Verdict manipulation");
  });
  it("renders nothing for a clean skill", () => {
    const { container } = wrap(<InjectionBanner injection={{ detected: false, reasons: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
