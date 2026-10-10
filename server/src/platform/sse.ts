import { EventEmitter } from 'node:events';
import type { RunEvent, RunEventKind } from '@devdigest/shared';

/**
 * SSE / run-log bus.
 *
 * During a run, events are pushed to an in-memory buffer and emitted live to
 * any SSE subscriber on `/runs/:id/events`. On completion the full log is
 * persisted as ONE document in `run_traces` (done by the service layer, not here).
 *
 * Event shape on the wire (SSE `data`): RunEvent (see @devdigest/shared).
 */

/** Wall-clock time-of-day (HH:MM:SS, local) stamped on each log line. */
function clockTime(): string {
  return new Date().toTimeString().slice(0, 8);
}

/** Default grace for a not-yet-published run (runs publish within ms of creation). */
export const UNKNOWN_RUN_GRACE_MS = 30_000;

/** How long a completed run's buffer stays replayable before it is evicted. */
export const RUN_BUFFER_TTL_MS = 5 * 60_000;

/** Injectable one-shot timer (tests swap it for a manual clock). */
export type TimerFn = (fn: () => void, ms: number) => { cancel(): void };

const defaultTimer: TimerFn = (fn, ms) => {
  const h = setTimeout(fn, ms);
  h.unref?.();
  return { cancel: () => clearTimeout(h) };
};

export interface RunBusOptions {
  /** Evict a completed run's buffers after this long (default RUN_BUFFER_TTL_MS). */
  bufferTtlMs?: number;
  /** Default grace for streams on a not-yet-known run (default UNKNOWN_RUN_GRACE_MS). */
  unknownRunGraceMs?: number;
  timer?: TimerFn;
}

export class RunBus {
  private emitters = new Map<string, EventEmitter>();
  private buffers = new Map<string, RunEvent[]>();
  private seq = new Map<string, number>();
  private completed = new Set<string>();
  private cancelled = new Set<string>();
  private evictions = new Map<string, { cancel(): void }>();
  /** Fired by endAllStreams() (graceful shutdown) so open SSE streams finish. */
  private shutdown = new EventEmitter();
  private readonly bufferTtlMs: number;
  readonly unknownRunGraceMs: number;
  readonly timer: TimerFn;

  constructor(opts: RunBusOptions = {}) {
    this.bufferTtlMs = opts.bufferTtlMs ?? RUN_BUFFER_TTL_MS;
    this.unknownRunGraceMs = opts.unknownRunGraceMs ?? UNKNOWN_RUN_GRACE_MS;
    this.timer = opts.timer ?? defaultTimer;
    this.shutdown.setMaxListeners(0);
  }

  /** Whether this bus knows the run at all (has events, a buffer, or completed). */
  has(runId: string): boolean {
    return this.buffers.has(runId) || this.completed.has(runId);
  }

  /** Number of live event listeners for a run (diagnostics/tests). */
  listenerCount(runId: string): number {
    return this.emitters.get(runId)?.listenerCount('event') ?? 0;
  }

  /** Request cancellation of an in-flight run. The runner checks `isCancelled`
   *  at its next checkpoint (between map-reduce files) and stops. */
  cancel(runId: string): void {
    this.cancelled.add(runId);
  }

  /** Whether cancellation has been requested for a run. */
  isCancelled(runId: string): boolean {
    return this.cancelled.has(runId);
  }

  private emitterFor(runId: string): EventEmitter {
    let e = this.emitters.get(runId);
    if (!e) {
      e = new EventEmitter();
      e.setMaxListeners(50);
      this.emitters.set(runId, e);
      // Preserve any existing buffer/seq (e.g. a late subscriber after the run
      // completed must still be able to replay the buffered events).
      if (!this.buffers.has(runId)) this.buffers.set(runId, []);
      if (!this.seq.has(runId)) this.seq.set(runId, 0);
    }
    return e;
  }

  /** Publish a live event for a run. Returns the constructed RunEvent. */
  publish(runId: string, kind: RunEventKind, msg: string, data?: unknown): RunEvent {
    const e = this.emitterFor(runId);
    const next = (this.seq.get(runId) ?? 0) + 1;
    this.seq.set(runId, next);
    const event: RunEvent = { runId, seq: next, kind, msg, t: clockTime(), data };
    this.buffers.get(runId)!.push(event);
    e.emit('event', event);
    return event;
  }

  /** Subscribe to live events. Replays any buffered events first. */
  subscribe(runId: string, listener: (e: RunEvent) => void): () => void {
    // A completed run only replays — don't resurrect an emitter that would leak.
    if (this.completed.has(runId)) {
      for (const buffered of this.buffers.get(runId) ?? []) listener(buffered);
      return () => undefined;
    }
    const e = this.emitterFor(runId);
    for (const buffered of this.buffers.get(runId) ?? []) listener(buffered);
    e.on('event', listener);
    return () => e.off('event', listener);
  }

  /** The full buffered log for a run (used to persist the trace on completion). */
  buffer(runId: string): RunEvent[] {
    return this.buffers.get(runId) ?? [];
  }

  /** Signal completion and release buffers/emitters. */
  complete(runId: string): void {
    const e = this.emitters.get(runId);
    this.completed.add(runId);
    this.cancelled.delete(runId);
    e?.emit('done');
    // Keep the buffer briefly available for late subscribers; clear emitter.
    this.emitters.delete(runId);
    // …then evict it so a long-lived process doesn't accumulate every run's log.
    this.evictions.get(runId)?.cancel();
    this.evictions.set(
      runId,
      this.timer(() => this.evict(runId), this.bufferTtlMs),
    );
  }

  /** Drop every trace of a run from memory (buffers, seq, flags, emitter). */
  evict(runId: string): void {
    this.evictions.get(runId)?.cancel();
    this.evictions.delete(runId);
    this.emitters.get(runId)?.emit('done');
    this.emitters.delete(runId);
    this.buffers.delete(runId);
    this.seq.delete(runId);
    this.completed.delete(runId);
    this.cancelled.delete(runId);
  }

  /**
   * Release an (unknown/never-published) run's empty emitter + buffer once its
   * last subscriber leaves, so subscribing to a bogus id doesn't leak.
   */
  releaseIfIdle(runId: string): void {
    const e = this.emitters.get(runId);
    const buf = this.buffers.get(runId);
    if (this.completed.has(runId)) return;
    if (e && (e.listenerCount('event') > 0 || e.listenerCount('done') > 0)) return;
    if (buf && buf.length > 0) return;
    this.emitters.delete(runId);
    this.buffers.delete(runId);
    this.seq.delete(runId);
  }

  /** Graceful shutdown: end every open SSE stream (runs are NOT marked complete). */
  endAllStreams(): void {
    this.shutdown.emit('shutdown');
  }

  /** Subscribe to endAllStreams(). */
  onShutdown(listener: () => void): () => void {
    this.shutdown.once('shutdown', listener);
    return () => this.shutdown.off('shutdown', listener);
  }

  /** Whether a run has already completed (for replay-then-end late subscribers). */
  isComplete(runId: string): boolean {
    return this.completed.has(runId);
  }

  onDone(runId: string, listener: () => void): () => void {
    // A run that already completed fires immediately so late SSE subscribers,
    // after replaying the buffer, end the stream instead of hanging forever.
    if (this.completed.has(runId)) {
      queueMicrotask(listener);
      return () => undefined;
    }
    const e = this.emitterFor(runId);
    e.once('done', listener);
    return () => e.off('done', listener);
  }
}

export const runBus = new RunBus();

export interface StreamRunEventsOptions {
  /** Aborted when the client disconnects — ends the stream and unsubscribes. */
  signal?: AbortSignal;
  /**
   * For a run the bus doesn't know yet (no events published): how long to wait
   * for the first event before ending the stream instead of hanging forever.
   */
  unknownRunGraceMs?: number;
  /** The run is known to be finished (e.g. a persisted trace exists): replay + end. */
  finished?: boolean;
  timer?: TimerFn;
}

/**
 * Bridge the in-memory RunBus to an async iterator for the SSE plugin:
 * replay the buffer first, then live events; ends on run completion, client
 * disconnect (`signal`), graceful shutdown, or — for a run that never shows up —
 * after `unknownRunGraceMs`. Always unsubscribes.
 */
export async function* streamRunEvents(
  bus: RunBus,
  runId: string,
  opts: StreamRunEventsOptions = {},
): AsyncGenerator<RunEvent> {
  const timer = opts.timer ?? bus.timer;
  const known = bus.has(runId);
  const queue: RunEvent[] = [];
  let wake: (() => void) | null = null;
  let done = Boolean(opts.finished) || Boolean(opts.signal?.aborted);
  let gotEvent = false;
  let graceTimer: { cancel(): void } | undefined;
  const finish = () => {
    done = true;
    wake?.();
  };

  const unsubscribe = bus.subscribe(runId, (e) => {
    gotEvent = true;
    graceTimer?.cancel();
    queue.push(e);
    wake?.();
  });
  const offDone = bus.onDone(runId, finish);
  const offShutdown = bus.onShutdown(finish);
  opts.signal?.addEventListener('abort', finish, { once: true });
  if (!known && !gotEvent && !done) {
    graceTimer = timer(finish, opts.unknownRunGraceMs ?? bus.unknownRunGraceMs);
  }

  try {
    while (true) {
      if (queue.length === 0) {
        if (done) break;
        await new Promise<void>((r) => (wake = r));
        wake = null;
        continue;
      }
      if (opts.signal?.aborted) break;
      yield queue.shift()!;
    }
  } finally {
    graceTimer?.cancel();
    unsubscribe();
    offDone();
    offShutdown();
    opts.signal?.removeEventListener('abort', finish);
    bus.releaseIfIdle(runId);
  }
}
