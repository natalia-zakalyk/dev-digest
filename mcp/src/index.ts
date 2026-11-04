import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { HttpDevDigestApi } from './api/http-devdigest-api.js';
import { parseConfig } from './config.js';
import { originOf } from './shape/text.js';
import { createServer } from './server.js';
import type { Clock } from './ports.js';
import { createDeps } from './use-cases/index.js';

/**
 * Composition root: the only place that knows concrete classes and `process`.
 * stdout carries MCP protocol messages only; every log line goes to stderr.
 */

const SHUTDOWN_GRACE_MS = 50;

function log(message: string): void {
  process.stderr.write(`[devdigest-mcp] ${message}\n`);
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

async function main(): Promise<void> {
  const config = parseConfig(process.env);
  const api = new HttpDevDigestApi({ baseUrl: config.baseUrl });
  const deps = createDeps({ api, clock: realClock, runWaitMs: config.runWaitMs });
  const server = createServer(deps);

  let stopping = false;
  const shutdown = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    log(`${signal} received, shutting down`);
    // Clients kill ~100 ms after SIGTERM: close best-effort, then exit regardless.
    const timer = setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS);
    timer.unref();
    server.close().then(
      () => process.exit(0),
      () => process.exit(0),
    );
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await server.connect(new StdioServerTransport());
  log(`ready (API ${originOf(config.baseUrl)}, run wait ${config.runWaitMs} ms)`);
}

main().catch((err: unknown) => {
  log(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
