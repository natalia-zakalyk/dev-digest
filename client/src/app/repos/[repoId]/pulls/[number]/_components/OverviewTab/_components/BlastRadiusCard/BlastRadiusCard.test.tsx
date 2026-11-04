import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadiusResponse } from "@/lib/types";
import blast from "../../../../../../../../../../messages/en/blast.json";
import common from "../../../../../../../../../../messages/en/common.json";

// Mock at the API boundary only: the real hooks and cache run.
const m = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: m.get, post: m.post } }));

import { BlastRadiusCard } from "./BlastRadiusCard";
import { GRAPH_MAX_SYMBOLS } from "./constants";

const DATA: BlastRadiusResponse = {
  changed_symbols: [
    { name: "rateLimit", file: "src/lib/rate-limit.ts", kind: "function" },
    { name: "unused", file: "src/lib/rate-limit.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [
        { name: "listItems", file: "src/api/public/index.ts", line: 23, endpoints_affected: ["GET /api/public/items"], crons_affected: [] },
        { name: "tick", file: "src/jobs/reset.ts", line: 7, endpoints_affected: [], crons_affected: ["reset-rate-buckets (hourly)"] },
      ],
      endpoints_affected: ["GET /api/public/items"],
      crons_affected: ["reset-rate-buckets (hourly)"],
    },
  ],
  summary: "2 symbols changed · 2 callers · 1 endpoint · 1 cron",
  counts: { symbols: 2, callers: 2, endpoints: 1, crons: 1 },
  degraded: false,
  reason: null,
};

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ blast, common }}>
        <BlastRadiusCard prId="pr1" repoId="repo1" repoFullName="acme/api" headSha="abc123" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  m.get.mockReset();
  m.post.mockReset();
});
afterEach(cleanup);

describe("BlastRadiusCard", () => {
  it("shows counts, caller links at the head sha, endpoint and cron chips, and collapses a symbol", async () => {
    m.get.mockResolvedValue(DATA);
    renderCard();

    expect(screen.getByText("Loading blast radius…")).toBeInTheDocument();
    expect(await screen.findByText("rateLimit()")).toBeInTheDocument();
    expect(m.get).toHaveBeenCalledWith("/pulls/pr1/blast");
    expect(screen.getByText("cron/jobs")).toBeInTheDocument();
    expect(screen.getByText("2 callers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "tree" })).toHaveAttribute("aria-pressed", "true");

    const link = screen.getByRole("link", { name: "src/api/public/index.ts:23" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/api/blob/abc123/src/api/public/index.ts#L23");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "src/jobs/reset.ts:7" })).toBeInTheDocument();
    expect(screen.getByLabelText("Endpoint: GET /api/public/items")).toBeInTheDocument();
    expect(screen.getByLabelText("Cron job: reset-rate-buckets (hourly)")).toBeInTheDocument();
    expect(screen.getByText("1 more changed symbol with no callers found.")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /rateLimit\(\)/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "src/api/public/index.ts:23" })).not.toBeInTheDocument();
  });

  it("says so when there are no callers", async () => {
    m.get.mockResolvedValue({
      ...DATA,
      changed_symbols: [DATA.changed_symbols[0]],
      downstream: [],
      counts: { symbols: 1, callers: 0, endpoints: 0, crons: 0 },
    });
    renderCard();
    expect(await screen.findByText("1 changed symbol, no downstream callers found.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps the data under a partial-index note; flag_off shows the note and no tree", async () => {
    m.get.mockResolvedValue({ ...DATA, degraded: true, reason: "index_partial" });
    renderCard();
    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent(blast.degraded.reason.index_partial);
    expect(screen.getByText("rateLimit()")).toBeInTheDocument();
    // positive control for the absence check below: in the normal state "callers" does match
    expect(screen.getAllByText(/callers/).length).toBeGreaterThan(0);
    cleanup();

    m.get.mockResolvedValue({
      ...DATA,
      changed_symbols: [],
      downstream: [],
      counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
      degraded: true,
      reason: "flag_off",
    });
    renderCard();
    expect(await screen.findByRole("note")).toHaveTextContent(blast.degraded.reason.flag_off);
    expect(screen.queryByText(/callers/)).not.toBeInTheDocument();
    expect(screen.queryByText("rateLimit()")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-analyze" })).not.toBeInTheDocument();
  });

  it("resyncs from the degraded note, treats an unknown reason as no_data, and shows load errors", async () => {
    m.get.mockResolvedValue({ ...DATA, downstream: [], degraded: true, reason: "something_new" });
    m.post.mockResolvedValue({ status: "queued" });
    renderCard();
    expect(await screen.findByRole("note")).toHaveTextContent(blast.degraded.reason.no_data);
    fireEvent.click(screen.getByRole("button", { name: "Re-analyze" }));
    await waitFor(() => expect(m.post).toHaveBeenCalledWith("/repos/repo1/resync"));
    cleanup();

    m.get.mockRejectedValue(new Error("boom"));
    renderCard();
    expect(await screen.findByText("Couldn't load the blast radius.")).toBeInTheDocument();
  });
  it("renders a very long caller path and endpoint in full, with a working link", async () => {
    const longPath = `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/${"Very".repeat(30)}.tsx`;
    const longEndpoint = `GET /api/${"segment/".repeat(20)}`;
    m.get.mockResolvedValue({
      ...DATA,
      downstream: [
        {
          symbol: "rateLimit",
          callers: [{ name: "x", file: longPath, line: 9 }],
          endpoints_affected: [longEndpoint],
          crons_affected: [],
        },
      ],
    });
    renderCard();
    // nothing is truncated or dropped: the full path is the link text and the full endpoint is a named chip
    const link = await screen.findByRole("link", { name: `${longPath}:9` });
    expect(link).toHaveAttribute("href", expect.stringContaining(`#L9`));
    expect(screen.getByLabelText(`Endpoint: ${longEndpoint}`)).toBeInTheDocument();
  });

  it("switches between tree and graph, and hides the toggle without data", async () => {
    m.get.mockResolvedValue(DATA);
    renderCard();
    expect(await screen.findByText("rateLimit()")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "View" });
    expect(group).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "graph" }));
    expect(screen.getByRole("button", { name: "graph" })).toHaveAttribute("aria-pressed", "true");
    const svg = screen.getByRole("img", { name: "Blast radius graph" });
    expect(svg).toHaveTextContent("1 changed symbol, 2 callers, 2 endpoints and cron jobs.");
    expect(within(svg).getByText("rateLimit()")).toBeInTheDocument();
    expect(within(svg).getByText("listItems")).toBeInTheDocument();
    expect(within(svg).getByText("index.ts:23")).toBeInTheDocument();
    expect(within(svg).getByText("1 OF 2 SYMBOLS")).toBeInTheDocument(); // "unused" has no callers, so it is not drawn
    expect(within(svg).getByText("2 CALLERS")).toBeInTheDocument();
    expect(within(svg).getByText("1 ENDPOINT")).toBeInTheDocument();
    expect(within(svg).getByText("1 CRON")).toBeInTheDocument();
    expect(screen.queryByText(/not to a single caller/)).not.toBeInTheDocument(); // per-caller data: no note
    expect(within(svg).getByText("GET /api/public/i…")).toBeInTheDocument();
    expect(within(svg).getByText("GET /api/public/items")).toBeInTheDocument(); // full text in <title>
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/not drawn/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "tree" }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    cleanup();

    m.get.mockResolvedValue({
      ...DATA,
      changed_symbols: [],
      downstream: [],
      counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
      degraded: true,
      reason: "flag_off",
    });
    renderCard();
    expect(await screen.findByRole("note")).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    cleanup();

    m.get.mockResolvedValue({ ...DATA, downstream: [] });
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "graph" }));
    expect(screen.getByText("No downstream callers to graph.")).toBeInTheDocument();
  });

  it("keeps the attribution note only when callers carry no per-caller facts (older server)", async () => {
    const legacy = {
      ...DATA,
      downstream: [
        {
          ...DATA.downstream[0]!,
          callers: [{ name: "listItems", file: "src/api/public/index.ts", line: 23 }],
        },
      ],
    };
    m.get.mockResolvedValue(legacy);
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "graph" }));
    const svg = screen.getByRole("img", { name: "Blast radius graph" });
    expect(within(svg).getByText("1 CRON")).toBeInTheDocument();
    expect(screen.getByText(/not to a single caller/)).toBeInTheDocument();
  });

  it("draws only the first GRAPH_MAX_SYMBOLS symbols and says how many are not drawn", async () => {
    const total = GRAPH_MAX_SYMBOLS + 3;
    const downstream = Array.from({ length: total }, (_, i) => ({
      symbol: `sym${i}`,
      callers: [{ name: `caller${i}`, file: "a.ts", line: i + 1 }],
      endpoints_affected: [],
      crons_affected: [],
    }));
    m.get.mockResolvedValue({ ...DATA, downstream, counts: { symbols: total, callers: total, endpoints: 0, crons: 0 } });
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "graph" }));
    const svg = screen.getByRole("img", { name: "Blast radius graph" });
    expect(within(svg).getByText("sym0()")).toBeInTheDocument();
    expect(within(svg).getByText(`sym${GRAPH_MAX_SYMBOLS - 1}()`)).toBeInTheDocument();
    expect(within(svg).queryByText(`sym${GRAPH_MAX_SYMBOLS}()`)).not.toBeInTheDocument();
    expect(screen.getByText("3 more symbols with callers are not drawn.")).toBeInTheDocument();
  });

  it("draws symbols that reach endpoints first and shows N OF M headers only when something is not drawn", async () => {
    const total = GRAPH_MAX_SYMBOLS + 2;
    const downstream = Array.from({ length: total }, (_, i) => {
      const reaches = i >= total - 2;
      return {
        symbol: `sym${i}`,
        callers: [
          {
            name: `caller${i}`,
            file: "a.ts",
            line: i + 1,
            endpoints_affected: reaches ? [`GET /e${i}`] : [],
            crons_affected: [],
          },
        ],
        endpoints_affected: reaches ? [`GET /e${i}`] : [],
        crons_affected: [],
      };
    });
    m.get.mockResolvedValue({ ...DATA, downstream, counts: { symbols: 98, callers: total, endpoints: 4, crons: 0 } });
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "graph" }));
    const svg = screen.getByRole("img", { name: "Blast radius graph" });
    expect(within(svg).getByText(`sym${total - 1}()`)).toBeInTheDocument();
    expect(within(svg).getByText(`GET /e${total - 1}`)).toBeInTheDocument();
    expect(within(svg).getByText(`GET /e${total - 2}`)).toBeInTheDocument();
    expect(within(svg).getByText(`${GRAPH_MAX_SYMBOLS} OF 98 SYMBOLS`)).toBeInTheDocument();
    expect(within(svg).getByText(`${GRAPH_MAX_SYMBOLS} OF ${total} CALLERS`)).toBeInTheDocument();
    expect(within(svg).getByText("2 OF 4 ENDPOINTS")).toBeInTheDocument();
    expect(within(svg).getByText("0 CRONS")).toBeInTheDocument(); // everything drawn: plain form
  });
});
