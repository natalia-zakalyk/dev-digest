import { describe, it, expect } from "vitest";
import { callerHref, callerLabel, canResync, layoutBlastGraph, resolveReason, symbolsWithoutCallers, truncateLabel } from "./helpers";
import { GRAPH_MAX_SYMBOLS } from "./constants";

describe("blast helpers", () => {
  it("builds the caller label and a head-sha GitHub link, or none without a repo", () => {
    const caller = { name: "handler", file: "src/api/public/index.ts", line: 23 };
    expect(callerLabel(caller)).toBe("src/api/public/index.ts:23");
    expect(callerHref("acme/api", "abc", caller)).toBe(
      "https://github.com/acme/api/blob/abc/src/api/public/index.ts#L23",
    );
    expect(callerHref(null, "abc", caller)).toBeNull();
  });

  it("lists unique changed symbols that have no callers", () => {
    const changed = (name: string) => ({ name, file: "a.ts", kind: "function" });
    expect(
      symbolsWithoutCallers({
        changed_symbols: [changed("a"), changed("a"), changed("b"), changed("c")],
        downstream: [{ symbol: "a", callers: [], endpoints_affected: [], crons_affected: [] }],
      }),
    ).toEqual(["b", "c"]);
  });

  it("falls back to no_data for an unknown reason and gates resync", () => {
    expect(resolveReason("index_partial")).toBe("index_partial");
    expect(resolveReason("weird")).toBe("no_data");
    expect(resolveReason(undefined)).toBe("no_data");
    expect(canResync("flag_off")).toBe(false);
    expect(canResync("index_failed")).toBe(true);
  });

  it("truncates labels with an ellipsis", () => {
    expect(truncateLabel("short", 18)).toBe("short");
    expect(truncateLabel("abcdefghij", 5)).toBe("abcd…");
  });

  describe("layoutBlastGraph", () => {
    const impact = (symbol: string, callers: number, endpoints: string[] = [], crons: string[] = []) => ({
      symbol,
      callers: Array.from({ length: callers }, (_, i) => ({ name: `${symbol}Caller${i}`, file: "a.ts", line: i + 1 })),
      endpoints_affected: endpoints,
      crons_affected: crons,
    });

    const withFacts = (symbol: string, callers: { name: string; endpoints?: string[]; crons?: string[] }[], e: string[], c: string[] = []) => ({
      symbol,
      callers: callers.map((x, i) => ({
        name: x.name,
        file: "src/routes/cart.routes.ts",
        line: i + 17,
        endpoints_affected: x.endpoints,
        crons_affected: x.crons,
      })),
      endpoints_affected: e,
      crons_affected: c,
    });

    it("draws caller->endpoint and caller->cron edges from per-caller facts, with shared targets deduplicated", () => {
      const layout = layoutBlastGraph([
        withFacts(
          "a",
          [
            { name: "checkout", endpoints: ["GET /cart/total"], crons: [] },
            { name: "summary", endpoints: ["GET /cart/total", "GET /cart"] },
            { name: "job", endpoints: [], crons: ["*/15 * * * *"] },
            { name: "leaf", endpoints: [], crons: [] },
          ],
          ["GET /cart/total", "GET /cart"],
          ["*/15 * * * *"],
        ),
      ]);
      const kinds = (k: string) => layout.nodes.filter((n) => n.kind === k);
      const byId = new Map(layout.nodes.map((n) => [n.id, n]));
      const out = (name: string) =>
        layout.edges.filter((e) => byId.get(e.from)?.label === name).map((e) => byId.get(e.to)!.fullLabel);
      expect(kinds("endpoint")).toHaveLength(2);
      expect(kinds("cron")).toHaveLength(1);
      expect(out("checkout")).toEqual(["GET /cart/total"]);
      expect(out("summary")).toEqual(["GET /cart/total", "GET /cart"]);
      expect(out("job")).toEqual(["*/15 * * * *"]);
      expect(out("leaf")).toEqual([]);
      expect(out("a()")).toHaveLength(4); // symbol -> callers only, no symbol -> endpoint edges
      expect(layout.edges).toHaveLength(4 + 3 + 1);
      expect(layout.usesSymbolLevelTargets).toBe(false);
      // Four distinct column positions, callers show basename:line.
      expect(layout.columns.map((c) => c.x)).toEqual([0, 198, 396, 594]);
      expect(layout.columns.map((c) => c.count)).toEqual([1, 4, 2, 1]);
      expect(kinds("caller")[0]?.sublabel).toBe("cart.routes.ts:17");
      expect(kinds("caller")[0]?.fullSublabel).toBe("cart.routes.ts:17");
    });

    it("falls back to symbol->endpoint edges and no caller->endpoint edges without per-caller facts", () => {
      const layout = layoutBlastGraph([impact("a", 2, ["GET /x"], ["job (daily)"]), impact("b", 1, ["GET /x"])]);
      const kindOf = new Map(layout.nodes.map((n) => [n.id, n.kind]));
      expect(layout.nodes.filter((n) => n.kind === "endpoint")).toHaveLength(1);
      expect(layout.nodes.filter((n) => n.kind === "cron")).toHaveLength(1);
      expect(layout.edges).toHaveLength(3 + 3);
      for (const e of layout.edges) expect(kindOf.get(e.from)).toBe("symbol");
      expect(layout.usesSymbolLevelTargets).toBe(true);
    });

    it("skips symbols without callers, caps symbols/callers/targets and counts what is hidden", () => {
      const many = Array.from({ length: GRAPH_MAX_SYMBOLS + 2 }, (_, i) => impact(`s${i}`, 1));
      const layout = layoutBlastGraph([impact("none", 0), ...many]);
      expect(layout.drawnSymbols).toBe(GRAPH_MAX_SYMBOLS);
      expect(layout.hiddenSymbols).toBe(2);
      expect(layout.nodes.some((n) => n.fullLabel === "none()")).toBe(false);

      const capped = layoutBlastGraph([impact("a", 5, ["e1", "e2", "e3"])], {
        maxSymbols: 8,
        maxCallersPerSymbol: 2,
        maxTargets: 2,
        labelMax: 4,
      });
      expect(capped.drawnCallers).toBe(2);
      expect(capped.hiddenCallers).toBe(3);
      expect(capped.drawnTargets).toBe(2);
      expect(capped.hiddenTargets).toBe(1);
      const long = capped.nodes.find((n) => n.kind === "symbol");
      expect(long?.fullLabel).toBe("a()");
      const trimmed = capped.nodes.find((n) => n.fullLabel === "aCaller0");
      expect(trimmed?.label).toBe("aCa…");
    });

    it("draws symbols that reach endpoints first, then the rest, each in tree order", () => {
      const list = Array.from({ length: 10 }, (_, i) =>
        i >= 8 ? withFacts(`s${i}`, [{ name: `c${i}`, endpoints: [`GET /e${i}`] }], [`GET /e${i}`]) : withFacts(`s${i}`, [{ name: `c${i}`, endpoints: [] }], []),
      );
      const layout = layoutBlastGraph(list);
      const symbols = layout.nodes.filter((n) => n.kind === "symbol").map((n) => n.fullLabel);
      expect(layout.drawnSymbols).toBe(GRAPH_MAX_SYMBOLS);
      expect(layout.hiddenSymbols).toBe(2);
      expect(new Set(symbols)).toEqual(new Set(["s8()", "s9()", "s0()", "s1()", "s2()", "s3()", "s4()", "s5()"]));
      // Symbol ids follow the drawn order: endpoint-reaching first, then tree order.
      expect(layout.nodes.find((n) => n.id === "s0")?.fullLabel).toBe("s8()");
      expect(layout.nodes.find((n) => n.id === "s1")?.fullLabel).toBe("s9()");
      expect(layout.nodes.find((n) => n.id === "s2")?.fullLabel).toBe("s0()");
      expect(layout.nodes.find((n) => n.id === "s7")?.fullLabel).toBe("s5()");
      expect(layout.nodes.filter((n) => n.kind === "endpoint").map((n) => n.fullLabel)).toEqual(["GET /e8", "GET /e9"]);
      expect(layout.columns.find((c) => c.kind === "endpoint")?.count).toBe(2);
    });

    it("keeps tree order when no symbol reaches an endpoint or cron", () => {
      const layout = layoutBlastGraph(Array.from({ length: 10 }, (_, i) => impact(`s${i}`, 1)));
      const ordered = layout.nodes.filter((n) => n.kind === "symbol").sort((a, b) => a.y - b.y).map((n) => n.fullLabel);
      expect(ordered).toEqual(Array.from({ length: GRAPH_MAX_SYMBOLS }, (_, i) => `s${i}()`));
    });

    it("returns an empty layout for no callers", () => {
      const layout = layoutBlastGraph([impact("a", 0)]);
      expect(layout.nodes).toEqual([]);
      expect(layout.edges).toEqual([]);
      expect(layout.drawnSymbols).toBe(0);
    });
  });
});
