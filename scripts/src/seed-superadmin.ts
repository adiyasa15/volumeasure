import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../.env") });

import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { userProfilesTable } from "@workspace/db/schema";
import { eq, or } from "drizzle-orm";

const { Pool } = pg;

function resolveConnectionString(): string {
  const url = process.env.DATABASE_URL ?? "";
  const pgHost = process.env.PGHOST ?? "";
  const urlIsLocalhost = /localhost|127\.0\.0\.1/.test(url);
  const pgHostIsRemote = pgHost && !/localhost|127\.0\.0\.1/.test(pgHost);
  if (url && !(urlIsLocalhost && pgHostIsRemote)) return url;
  if (pgHost) {
    const user = process.env.PGUSER ?? "postgres";
    const pass = process.env.PGPASSWORD ?? "";
    const port = process.env.PGPORT ?? "5432";
    const db   = process.env.PGDATABASE ?? "postgres";
    return `postgresql://${user}:${encodeURIComponent(pass)}@${pgHost}:${port}/${db}`;
  }
  if (url) return url;
  throw new Error("DATABASE_URL must be set.");
}

const pool = new Pool({ connectionString: resolveConnectionString() });
const db = drizzle(pool);

const USERNAME = "superadmin";
const PASSWORD = "D1gitech";
const EMAIL = "superadmin@pilemetric.local";
const DISPLAY_NAME = "Super Admin";

async function main() {
  console.log("Checking for existing superadmin...");

  const [existing] = await db
    .select()
    .from(userProfilesTable)
    .where(
      or(
        eq(userProfilesTable.username, USERNAME),
        eq(userProfilesTable.email, EMAIL),
      ),
    )
    .limit(1);

  if (existing) {
    console.log(`Superadmin already exists (id: ${existing.id}, username: ${existing.username}, role: ${existing.role}, status: ${existing.status})`);
    console.log("Updating role, status, and password to super_admin / approved...");
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await db
      .update(userProfilesTable)
      .set({ role: "super_admin", status: "approved", passwordHash })
      .where(eq(userProfilesTable.id, existing.id));
    console.log("Done.");
    await pool.end();
    return;
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const [inserted] = await db
    .insert(userProfilesTable)
    .values({
      username: USERNAME,
      email: EMAIL,
      displayName: DISPLAY_NAME,
      passwordHash,
      role: "super_admin",
      status: "approved",
    })
    .returning();

  console.log(`Superadmin created successfully!`);
  console.log(`  ID:       ${inserted.id}`);
  console.log(`  Username: ${inserted.username}`);
  console.log(`  Email:    ${inserted.email}`);
  console.log(`  Role:     ${inserted.role}`);
  console.log(`  Status:   ${inserted.status}`);
  console.log(``);
  console.log(`Login credentials:`);
  console.log(`  Username: ${USERNAME}`);
  console.log(`  Password: ${PASSWORD}`);

  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
