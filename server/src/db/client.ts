import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { schema } from './schema.js';

export type Db = PostgresJsDatabase<typeof schema>;

/** A Drizzle transaction handle (what `db.transaction(async (tx) => …)` yields). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Anything a repository can run queries on: the shared client OR an open
 * transaction. Repositories take this so a service can compose several writes
 * into ONE transaction by passing the `tx` down (DB-2/DB-3).
 */
export type DbExecutor = Db | Tx;

export interface DbHandle {
  db: Db;
  sql: postgres.Sql;
  close: () => Promise<void>;
}

/** Pool defaults (DB-13). Overridable per call; the app uses the defaults. */
export const DB_POOL_DEFAULTS = {
  max: 10,
  /** Close a pooled connection after it sat idle this long (seconds). */
  idleTimeoutSec: 30,
  /** Give up opening a connection after this long (seconds). */
  connectTimeoutSec: 10,
  /** Server-side `statement_timeout` per connection (ms); 0 disables it. */
  statementTimeoutMs: 60_000,
} as const;

export interface CreateDbOptions {
  max?: number;
  idleTimeoutSec?: number;
  connectTimeoutSec?: number;
  statementTimeoutMs?: number;
}

/**
 * Create a Drizzle client over postgres-js. Used by the app (one shared handle)
 * and by the Testcontainers harness (per-test handle).
 */
export function createDb(databaseUrl: string, opts?: CreateDbOptions): DbHandle {
  const statementTimeoutMs = opts?.statementTimeoutMs ?? DB_POOL_DEFAULTS.statementTimeoutMs;
  const sql = postgres(databaseUrl, {
    max: opts?.max ?? DB_POOL_DEFAULTS.max,
    idle_timeout: opts?.idleTimeoutSec ?? DB_POOL_DEFAULTS.idleTimeoutSec,
    connect_timeout: opts?.connectTimeoutSec ?? DB_POOL_DEFAULTS.connectTimeoutSec,
    // Sent as a startup parameter, so it applies to every statement on every
    // pooled connection — a runaway query can't pin a connection forever.
    ...(statementTimeoutMs > 0
      ? { connection: { statement_timeout: statementTimeoutMs } }
      : {}),
  });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}
