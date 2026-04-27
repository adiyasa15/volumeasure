/**
 * One-time fix: download DSM for job b6dd740e via WebODM API path,
 * compute accurate volume and cache DSM bytes in the DB.
 * Run with: npx tsx scripts/fix-volume.ts
 */
import { calculateVolumeFromDSM, setTokenOverride } from "../src/lib/webodm.ts";
import { db } from "@workspace/db";
import { jobsTable } from "@workspace/db/schema/jobs.ts";
import { eq } from "drizzle-orm";

const JOB_ID = "b6dd740e-472b-433b-ab31-1953ff311047";

async function main() {
  const tok = process.env.WEBODM_LIGHTNING_TOKEN;
  if (!tok) throw new Error("WEBODM_LIGHTNING_TOKEN not set");
  setTokenOverride(tok);

  const [row] = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.id, JOB_ID));

  if (!row) throw new Error(`Job ${JOB_ID} not found`);
  console.log("Job:", row.name);
  console.log("WebODM task ID:", row.webodmTaskId);
  console.log("Current volume:", row.volumeM3, "m³");
  console.log("Has DSM cache:", !!row.dsmCacheB64);

  const polygon = row.polygonCoordinates as number[][];
  if (!polygon || polygon.length < 3) throw new Error("No polygon saved — draw one in the UI first");

  console.log(`\nDownloading DSM for task ${row.webodmTaskId} …`);
  const vol = await calculateVolumeFromDSM(row.webodmTaskId!, polygon);

  if (!vol) {
    console.error("❌ DSM download failed on all URL paths");
    process.exit(1);
  }

  console.log("\n✅ Volume calculated:");
  console.log("  Net:  ", vol.netM3.toFixed(4), "m³");
  console.log("  Cut:  ", vol.cutM3.toFixed(4), "m³");
  console.log("  Fill: ", vol.fillM3.toFixed(4), "m³");
  console.log("  Area: ", vol.areaSqm.toFixed(2), "m²");
  console.log("  Triangulated base:", vol.triangulated);

  await db
    .update(jobsTable)
    .set({
      volumeM3:     vol.netM3,
      cutVolumeM3:  vol.cutM3,
      fillVolumeM3: vol.fillM3,
      areaSqm:      vol.areaSqm,
      dsmCacheB64:  vol.rawDsm.toString("base64"),
      dtmCacheB64:  vol.rawDtm ? vol.rawDtm.toString("base64") : null,
      updatedAt:    new Date(),
    })
    .where(eq(jobsTable.id, JOB_ID));

  console.log("\n✅ DB updated — DSM bytes cached for future polygon edits");
}

main().catch((err) => { console.error(err); process.exit(1); });
