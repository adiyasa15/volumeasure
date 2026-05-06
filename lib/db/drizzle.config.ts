import { defineConfig } from "drizzle-kit";
import path from "path";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env") });

function resolveConnectionString(): string {
  const url = process.env.DATABASE_URL ?? "";
  const pgHost = process.env.PGHOST ?? "";

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

  throw new Error("DATABASE_URL must be set. Ensure the database is provisioned.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: resolveConnectionString(),
  },
});
