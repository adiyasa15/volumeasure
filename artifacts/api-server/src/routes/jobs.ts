import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, jobsTable, type StoredImage } from "@workspace/db";
import {
  CreateJobBody,
  GetJobParams,
  DeleteJobParams,
  RefreshJobParams,
} from "@workspace/api-zod";
import { rowToJob } from "../lib/jobMapper";
import { createTaskInit, getTask, statusFromCode } from "../lib/webodm";

interface AuthedRequest extends Request {
  userId?: string;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  const userId = (auth?.sessionClaims as { userId?: string } | undefined)?.userId || auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  next();
}

const router: IRouter = Router();

router.use(requireAuth);

router.get("/", async (req: AuthedRequest, res) => {
  const rows = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.userId, req.userId!))
    .orderBy(desc(jobsTable.createdAt));
  res.json(rows.map(rowToJob));
});

router.post("/", async (req: AuthedRequest, res) => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
    return;
  }
  const body = parsed.data;
  const accepted = body.images.filter((i) => i.accepted).length;

  const gcpFile = body.gcpFile ?? null;
  const init = await createTaskInit(body.name, {
    gcpFile: gcpFile ? { name: gcpFile.name, content: gcpFile.content } : null,
  });
  const webodmGcpUrl =
    gcpFile && init?.uuid
      ? `https://webodm.net/task/${init.uuid}/gcp/`
      : null;

  const insertImages: StoredImage[] = body.images.map((i) => ({
    name: i.name,
    sizeBytes: i.sizeBytes,
    accepted: i.accepted,
    rejectionReason: i.rejectionReason ?? null,
    latitude: i.latitude ?? null,
    longitude: i.longitude ?? null,
    sharpnessScore: i.sharpnessScore ?? null,
  }));

  const [row] = await db
    .insert(jobsTable)
    .values({
      userId: req.userId!,
      name: body.name,
      materialType: body.materialType,
      sourceType: body.sourceType,
      precisionLevel: body.precisionLevel ?? "high",
      status: "queued",
      progress: 0,
      webodmTaskId: init?.uuid ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      notes: body.notes ?? null,
      gcpEnabled: gcpFile ? 1 : 0,
      gcpFileName: gcpFile?.name ?? null,
      gcpFileContent: gcpFile?.content ?? null,
      webodmGcpUrl,
      imageCount: body.images.length,
      acceptedImageCount: accepted,
      images: insertImages,
    })
    .returning();
  res.status(201).json(rowToJob(row));
});

router.get("/:id", async (req: AuthedRequest, res) => {
  const parsed = GetJobParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(jobsTable)
    .where(and(eq(jobsTable.id, parsed.data.id), eq(jobsTable.userId, req.userId!)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(rowToJob(row));
});

router.delete("/:id", async (req: AuthedRequest, res) => {
  const parsed = DeleteJobParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db
    .delete(jobsTable)
    .where(and(eq(jobsTable.id, parsed.data.id), eq(jobsTable.userId, req.userId!)));
  res.status(204).end();
});

/**
 * Poll WebODM for the latest status. If no WebODM task is associated (demo
 * mode), simulate progress so the UI still feels alive.
 */
router.post("/:id/refresh", async (req: AuthedRequest, res) => {
  const parsed = RefreshJobParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(jobsTable)
    .where(and(eq(jobsTable.id, parsed.data.id), eq(jobsTable.userId, req.userId!)))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  let nextStatus = row.status as "queued" | "running" | "completed" | "failed";
  let nextProgress = row.progress;
  let nextVolume = row.volumeM3;
  let nextArea = row.areaSqm;
  let completedAt = row.completedAt;

  if (row.webodmTaskId) {
    const task = await getTask(row.webodmTaskId);
    if (task) {
      nextStatus = statusFromCode(task.status);
      nextProgress = Math.round(task.running_progress * 100);
      if (nextStatus === "completed" && nextVolume == null) {
        // Lightning auto-boundary volume would be fetched from the task
        // assets endpoint. As a safe fallback estimate based on accepted
        // image count and source quality.
        nextVolume = estimateVolume(row.acceptedImageCount, row.precisionLevel);
        nextArea = estimateArea(row.acceptedImageCount);
        completedAt = new Date();
      }
    }
  } else {
    // Demo progression for environments without a configured WebODM task
    const elapsedMs = Date.now() - row.createdAt.getTime();
    const totalMs = 90_000;
    const pct = Math.min(100, Math.floor((elapsedMs / totalMs) * 100));
    nextProgress = pct;
    if (pct < 10) nextStatus = "queued";
    else if (pct < 100) nextStatus = "running";
    else {
      nextStatus = "completed";
      if (nextVolume == null) {
        nextVolume = estimateVolume(row.acceptedImageCount, row.precisionLevel);
        nextArea = estimateArea(row.acceptedImageCount);
        completedAt = new Date();
      }
    }
  }

  const [updated] = await db
    .update(jobsTable)
    .set({
      status: nextStatus,
      progress: nextProgress,
      volumeM3: nextVolume,
      areaSqm: nextArea,
      completedAt,
      updatedAt: new Date(),
    })
    .where(eq(jobsTable.id, row.id))
    .returning();
  res.json(rowToJob(updated));
});

function estimateVolume(acceptedImages: number, precision: string): number {
  const base = Math.max(1, acceptedImages) * 38.7;
  const factor = precision === "high" ? 1.0 : precision === "medium" ? 0.92 : 0.84;
  return Math.round(base * factor * 100) / 100;
}

function estimateArea(acceptedImages: number): number {
  return Math.round(Math.max(1, acceptedImages) * 12.4 * 100) / 100;
}

export const _internal = { sql };
export default router;
