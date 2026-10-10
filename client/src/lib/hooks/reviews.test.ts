/**
 * useRunEvents — SSE lifecycle. A transient drop must keep EventSource's
 * auto-reconnect alive (and de-duplicate the server's replay); only a CLOSED
 * stream, or a reconnect that merely replays a finished run, ends `running`.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useRunEvents } from "./reviews";

class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readyState = FakeEventSource.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn(() => {
    this.readyState = FakeEventSource.CLOSED;
  });

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  listeners = new Map<string, Array<(ev: MessageEvent) => void>>();
  addEventListener(name: string, fn: (ev: MessageEvent) => void) {
    /* data events are delivered via onmessage in this fake; named listeners
       are kept so terminal events (`done`) can be fired explicitly */
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]);
  }

  /** Fire a named SSE event (e.g. the server's terminal `done`). */
  fire(name: string, data = "{}") {
    for (const fn of this.listeners.get(name) ?? []) fn({ data } as MessageEvent);
  }

  open() {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.();
  }

  emit(seq: number, msg: string, kind = "info") {
    this.onmessage?.({ data: JSON.stringify({ runId: "r1", seq, kind, msg, t: "00.01" }) } as MessageEvent);
  }

  /** Connection dropped; the browser will retry (or has given up when CLOSED). */
  fail(readyState: number) {
    this.readyState = readyState;
    this.onerror?.();
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function subscribe() {
  const hook = renderHook(() => useRunEvents(["r1"]));
  const es = FakeEventSource.instances[0]!;
  return { ...hook, es };
}

describe("useRunEvents", () => {
  it("opens one stream per run and accumulates parsed events", () => {
    const { result, es } = subscribe();
    expect(es.url).toMatch(/\/runs\/r1\/events$/);
    act(() => {
      es.open();
      es.emit(1, "Loading diff");
      es.emit(2, "Reviewing");
    });
    expect(result.current.running).toBe(true);
    expect(result.current.events.map((e) => e.msg)).toEqual(["Loading diff", "Reviewing"]);
  });

  it("keeps running through a transient error and de-duplicates the replay", () => {
    const { result, es } = subscribe();
    act(() => {
      es.open();
      es.emit(1, "Loading diff");
      es.fail(FakeEventSource.CONNECTING);
    });
    expect(es.close).not.toHaveBeenCalled();
    expect(result.current.running).toBe(true);

    // Reconnected: the server replays seq 1, then streams seq 2.
    act(() => {
      es.open();
      es.emit(1, "Loading diff");
      es.emit(2, "Reviewing");
    });
    expect(result.current.events.map((e) => e.msg)).toEqual(["Loading diff", "Reviewing"]);
    expect(result.current.running).toBe(true);
  });

  it("stops when the browser reports the stream CLOSED", () => {
    const { result, es } = subscribe();
    act(() => {
      es.open();
      es.emit(1, "Loading diff");
      es.fail(FakeEventSource.CLOSED);
    });
    expect(es.close).toHaveBeenCalled();
    expect(result.current.running).toBe(false);
  });

  it("stops when a reconnect only replays an already-finished run", () => {
    const { result, es } = subscribe();
    act(() => {
      es.open();
      es.emit(1, "Run complete; trace persisted");
      es.fail(FakeEventSource.CONNECTING); // server ended the stream
      es.open();
      es.emit(1, "Run complete; trace persisted"); // replay only
      es.fail(FakeEventSource.CONNECTING);
    });
    expect(es.close).toHaveBeenCalled();
    expect(result.current.running).toBe(false);
    expect(result.current.events).toHaveLength(1);
  });

  it("does nothing for an empty run list", () => {
    const { result } = renderHook(() => useRunEvents([]));
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current.running).toBe(false);
  });
  it("closes and stops running on the server's terminal `done` event", () => {
    const { result, es } = subscribe();
    act(() => {
      es.open();
      es.emit(1, "Reviewing");
      es.fire("done", JSON.stringify({ runId: "r1" }));
    });
    expect(es.close).toHaveBeenCalled();
    expect(result.current.running).toBe(false);
    expect(result.current.events.map((e) => e.msg)).toEqual(["Reviewing"]);
  });
});
