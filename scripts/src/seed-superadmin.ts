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

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const USERNAME = "superadmin";
const PASSWORD = "D1gitech";
const EMAIL = "adiyasa@gmail.com";
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
    console.log("Updating role and status to super_admin / approved...");
    await db
      .update(userProfilesTable)
      .set({ role: "super_admin", status: "approved" })
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
