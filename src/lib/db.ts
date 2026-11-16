import type { Pool } from "pg";

/** DATABASE_URL, or POSTGRES_URL as set by Vercel's Postgres integrations (Neon, Supabase). */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

const globalDb = globalThis as unknown as { __msscorePool?: Pool };

/** One shared PostgreSQL connection pool, or null when no database is configured. */
export function getPool(): Pool | null {
  if (globalDb.__msscorePool) return globalDb.__msscorePool;
  const url = databaseUrl();
  if (!url) return null;
  // Loaded lazily so the app runs without PostgreSQL in development.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool: PgPool } = require("pg") as typeof import("pg");
  const internal = /localhost|127\.0\.0\.1|\.railway\.internal|sslmode=disable/.test(url);
  globalDb.__msscorePool = new PgPool({
    connectionString: url,
    max: 5,
    ssl: internal ? undefined : { rejectUnauthorized: false },
  });
  return globalDb.__msscorePool;
}

/**
 * On serverless hosting each request can land on a different server, so
 * anything kept in memory would vanish between requests. A database is required there.
 */
export function storageMissingOnServerless(): boolean {
  return Boolean(process.env.VERCEL) && !databaseUrl();
}
