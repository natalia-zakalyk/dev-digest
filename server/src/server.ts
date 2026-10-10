import { buildApp } from './app.js';
import { loadConfig } from './platform/config.js';

/** Hard cap on graceful shutdown before we force-exit (stuck socket/job). */
const FORCE_EXIT_TIMEOUT_MS = 20_000;

/** Production/dev entrypoint. `pnpm dev` runs `tsx watch src/server.ts`. */
async function main() {
  const config = loadConfig();
  const app = await buildApp({ config });

  // Graceful shutdown: on SIGTERM/SIGINT close the server — preClose ends open
  // SSE streams, onClose waits (bounded) for in-flight jobs and closes the
  // postgres pool. Guarded so a second signal doesn't double-close; a timer
  // force-exits if anything hangs past FORCE_EXIT_TIMEOUT_MS.
  let closing = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, async () => {
      if (closing) return;
      closing = true;
      app.log.info(`${signal} received — shutting down`);
      const force = setTimeout(() => {
        app.log.error(`shutdown exceeded ${FORCE_EXIT_TIMEOUT_MS}ms — forcing exit`);
        process.exit(1);
      }, FORCE_EXIT_TIMEOUT_MS);
      force.unref();
      try {
        await app.close();
        process.exit(0);
      } catch (err) {
        app.log.error(err, 'error during shutdown');
        process.exit(1);
      }
    });
  }

  try {
    // Loopback by default (API_HOST env overrides) — the API has no auth.
    await app.listen({ port: config.apiPort, host: config.host });
    app.log.info(`DevDigest API listening on http://${config.host}:${config.apiPort}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
