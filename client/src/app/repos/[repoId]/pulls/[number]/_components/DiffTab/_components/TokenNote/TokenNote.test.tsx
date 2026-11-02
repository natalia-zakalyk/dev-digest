import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import prReview from "../../../../../../../../../../messages/en/prReview.json";
import { TokenNote } from "./TokenNote";

afterEach(cleanup);

describe("TokenNote", () => {
  it("states zero new tokens and the formatted source tokens", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview }}>
        <TokenNote sourceTokens={108089} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("0 new tokens · built on 108,089 from last review")).toBeInTheDocument();
  });
});
