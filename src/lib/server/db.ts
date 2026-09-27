import "server-only";
import postgres from "postgres";

/**
 * Server-only Postgres connection as the least-privilege `converge_server`
 * role. This role can read raw responses, so it must never be reachable from
 * the browser: this module imports "server-only", and DATABASE_URL has no
 * NEXT_PUBLIC_ prefix.
 */

declare global {
  var __convergeSql: postgres.Sql | undefined;
}

export class ConfigError extends Error {}

export function getSql(): postgres.Sql {
  if (globalThis.__convergeSql) return globalThis.__convergeSql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new ConfigError("DATABASE_URL is not configured");
  const sql = postgres(url, {
    // Supavisor transaction mode does not support prepared statements.
    prepare: false,
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  globalThis.__convergeSql = sql;
  return sql;
}
