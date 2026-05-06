import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

/**
 * Resolve the database connection URL.
 *
 * Priority:
 *  1. DATABASE_URL — if it does NOT point to localhost/127.0.0.1, use it as-is.
 *  2. Individual PG* env vars (PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE)
 *     — used when DATABASE_URL is absent or points to localhost but the actual
 *     database is on a different host (e.g. Replit's managed "helium" postgres).
 *  3. Fall back to DATABASE_URL even if it points to localhost (dev machines).
 */
function resolveConnectionString(): string {
  const url = process.env.DATABASE_URL ?? "";
  const pgHost = process.env.PGHOST ?? "";

  // If DATABASE_URL points to localhost/127.0.0.1 but PGHOST is a real remote
  // host, the secret is stale — build a URL from the individual PG* vars instead.
  const urlIsLocalhost = /localhost|127\.0\.0\.1/.test(url);
  const pgHostIsRemote = pgHost && !/localhost|127\.0\.0\.1/.test(pgHost);

  if (url && !(urlIsLocalhost && pgHostIsRemote)) {
    return url;
  }

  if (pgHost) {
    const user = process.env.PGUSER ?? "postgres";
    const pass = process.env.PGPASSWORD ?? "";
    const port = process.env.PGPORT ?? "5432";
    const db   = process.env.PGDATABASE ?? "postgres";
    return `postgresql://${user}:${encodeURIComponent(pass)}@${pgHost}:${port}/${db}`;
  }

  if (url) return url;

  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = resolveConnectionString();

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
