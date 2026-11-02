import { describe, it, expect, vi } from 'vitest';
import { RunBus } from '../src/platform/sse.js';
import { RunLogger, type PinoLike } from '../src/platform/run-logger.js';
import { buildPromptLogRecord, summarizePromptLog } from '../src/platform/prompt-log.js';

/**
 * RunLogger.ops(): operator-only record. It must reach pino and NEVER the RunBus, so it
 * stays out of the SSE stream and the persisted run_traces.log.
 */

function fakePino() {
  const calls: { level: keyof PinoLike; obj: Record<string, unknown>; msg?: string }[] = [];
  const mk = (level: keyof PinoLike) => (obj: unknown, msg?: string) => {
    calls.push({ level, obj: obj as Record<string, unknown>, msg });
  };
  const pino: PinoLike = { info: mk('info'), warn: mk('warn'), error: mk('error'), debug: mk('debug') };
  return { pino, calls };
}

function setup(runIds: string[] = ['run-1', 'run-2']) {
  const bus = new RunBus();
  const publish = vi.spyOn(bus, 'publish');
  const { pino, calls } = fakePino();
  const logger = new RunLogger(bus, runIds, pino, { correlationId: 'corr-1' });
  return { bus, publish, calls, logger };
}

describe('RunLogger.ops', () => {
  it('publishes 0 bus events and makes exactly 1 pino info call', () => {
    const { publish, calls, logger, bus } = setup();
    logger.ops('prompt assembled', { event: 'prompt.assembled', schema_version: 1 });
    expect(publish).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.level).toBe('info');
    expect(calls[0]!.msg).toBe('prompt assembled');
    // Nothing for the Live Log / run_traces.log of any target run.
    expect(logger.logFor('run-1')).toEqual([]);
    expect(logger.logFor('run-2')).toEqual([]);
    expect(bus.buffer('run-1')).toEqual([]);
  });

  it('carries ctx (correlationId), runIds and the record fields', () => {
    const { calls, logger } = setup();
    logger.ops('prompt assembled', { event: 'prompt.assembled', call: 'review' });
    expect(calls[0]!.obj).toEqual({
      correlationId: 'corr-1',
      runIds: ['run-1', 'run-2'],
      event: 'prompt.assembled',
      call: 'review',
    });
  });

  it('forRun keeps the correlationId, narrows runIds and merges extra ctx', () => {
    const { calls, logger, publish } = setup();
    logger.forRun('run-2', { agentId: 'a1' }).ops('x', { k: 1 });
    expect(calls[0]!.obj).toMatchObject({ correlationId: 'corr-1', runIds: ['run-2'], agentId: 'a1', k: 1 });
    expect(publish).not.toHaveBeenCalled();
  });

  it('is a safe no-op without a pino logger', () => {
    const bus = new RunBus();
    const publish = vi.spyOn(bus, 'publish');
    expect(() => new RunLogger(bus, ['run-1']).ops('x', { a: 1 })).not.toThrow();
    expect(publish).not.toHaveBeenCalled();
  });
});

describe('RunLogger.event (unchanged behaviour)', () => {
  it('publishes to every target run and mirrors to pino at the kind level, with data', () => {
    const { publish, calls, logger } = setup();
    logger.info('hello', { a: 1 });
    logger.tool('t');
    expect(publish).toHaveBeenCalledTimes(4); // 2 events x 2 runs
    expect(calls.map((c) => c.level)).toEqual(['info', 'debug']);
    expect(calls[0]!.obj).toMatchObject({ correlationId: 'corr-1', runIds: ['run-1', 'run-2'], kind: 'info', data: { a: 1 } });
    expect(calls[1]!.obj).not.toHaveProperty('data');
    expect(logger.logFor('run-1').map((l) => l.msg)).toEqual(['hello', 't']);
  });
});

describe('prompt-assembly Live Log summary line', () => {
  it('carries no data: SSE event and pino payload have no `data` key and no record fields', () => {
    const { bus, calls, logger } = setup(['run-1']);
    const record = buildPromptLogRecord({
      call: 'review',
      correlationId: 'corr-1',
      runId: 'run-1',
      agentId: 'agent-1',
      prId: 'pr-1',
      provider: 'openai',
      model: 'gpt-4.1',
      mode: 'single-pass',
      chunk: { index: 0, count: 1, label: 'all files' },
      sections: [
        { name: 'diff', source: 'git_diff', trust: 'untrusted', wrapped: true, chars: 400, tokens: 100, items: 1, truncated: false, itemsMeta: [] },
      ],
      verbose: false,
    });
    logger.ops('prompt assembled', record);
    logger.info(summarizePromptLog(record));

    const events = bus.buffer('run-1');
    expect(events).toHaveLength(1);
    expect(events[0]!.msg).toBe('prompt: 1 sections · ~100 tokens (diff ~100)');
    expect(events[0]!.data).toBeUndefined();
    expect(JSON.stringify(events[0])).not.toContain('prompt.assembled');
    // pino saw both lines; only the ops one carries the record, only the info one is on the bus.
    expect(calls).toHaveLength(2);
    expect(calls[0]!.obj).toMatchObject({ event: 'prompt.assembled' });
    expect(calls[1]!.obj).not.toHaveProperty('data');
    expect(logger.logFor('run-1')).toHaveLength(1);
  });
});
