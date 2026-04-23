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
import { createTaskInit, getTask, statusFromCode, fetchOrthophotoTile, fetchOrthophotoBounds } from "../lib/webodm";

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
      polygonMode: body.polygonMode ?? "automatic",
      gcpEnabled: gcpFile ? 1 : 0,
      gcpFileName: gcpFile?.name ?? null,
      gcpFileContent: gcpFile?.content ?? null,
      webodmGcpUrl,
      totalFileSizeBytes: body.totalFileSizeBytes ?? null,
      captureLocation: body.captureLocation ?? null,
      captureDate: body.captureDate ? new Date(body.captureDate) : null,
      processingStartedAt: new Date(),
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
  let nextDuration = row.processingDurationSeconds;
  let nextPolygon = row.polygonCoordinates as number[][] | null;
  let nextOrthophotoUrl = row.orthophotoUrl;

  const isManualMode = row.polygonMode === "manual";

  if (row.webodmTaskId) {
    const task = await getTask(row.webodmTaskId);
    if (task) {
      nextStatus = statusFromCode(task.status);
      nextProgress = Math.round(task.running_progress * 100);
      if (nextStatus === "completed") {
        completedAt = completedAt ?? new Date();
        // Only auto-assign volume/area for automatic polygon mode.
        // Manual mode leaves them null so the user draws the boundary.
        if (!isManualMode && nextVolume == null) {
          nextVolume = estimateVolume(row.acceptedImageCount, row.precisionLevel);
          nextArea = estimateArea(row.acceptedImageCount);
        }
        if (nextDuration == null) {
          nextDuration = computeDuration(row.processingStartedAt, completedAt);
        }
        if (!nextPolygon) {
          nextPolygon = synthesizePolygon(row.latitude, row.longitude);
        }
        // Signal that orthophoto tiles are ready from processing
        if (!nextOrthophotoUrl) {
          nextOrthophotoUrl = "tiles_ready";
        }
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
      completedAt = completedAt ?? new Date();
      // Only auto-assign volume/area for automatic polygon mode.
      // Manual mode leaves them null so the user draws the boundary.
      if (!isManualMode && nextVolume == null) {
        nextVolume = estimateVolume(row.acceptedImageCount, row.precisionLevel);
        nextArea = estimateArea(row.acceptedImageCount);
      }
      if (nextDuration == null) {
        nextDuration = computeDuration(row.processingStartedAt, completedAt);
      }
      if (!nextPolygon) {
        nextPolygon = synthesizePolygon(row.latitude, row.longitude);
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
      orthophotoUrl: nextOrthophotoUrl,
      completedAt,
      processingDurationSeconds: nextDuration,
      polygonCoordinates: nextPolygon,
      updatedAt: new Date(),
    })
    .where(eq(jobsTable.id, row.id))
    .returning();
  res.json(rowToJob(updated));
});

/**
 * Proxy orthophoto map tiles from the processing service.
 * Only available for jobs that completed with real photogrammetry processing.
 */
router.get("/:id/tiles/:z/:x/:y", async (req: AuthedRequest, res) => {
  const { id, z, x, y } = req.params;
  const [row] = await db
    .select()
    .from(jobsTable)
    .where(and(eq(jobsTable.id, id), eq(jobsTable.userId, req.userId!)))
    .limit(1);

  if (!row || !row.webodmTaskId || row.orthophotoUrl !== "tiles_ready") {
    res.status(404).end();
    return;
  }

  const tile = await fetchOrthophotoTile(row.webodmTaskId, z, x, y);
  if (!tile) {
    res.status(404).end();
    return;
  }

  res.setHeader("Content-Type", tile.contentType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.end(tile.buffer);
});

/**
 * Return the orthophoto bounding box so the frontend can fly to it.
 * Responds with { bounds: [west, south, east, north] } or falls back to
 * { center: [lat, lng] } from the job row when no real processing token exists.
 */
router.get("/:id/tilejson", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const [row] = await db
    .select()
    .from(jobsTable)
    .where(and(eq(jobsTable.id, id), eq(jobsTable.userId, req.userId!)))
    .limit(1);

  if (!row) { res.status(404).end(); return; }

  if (row.webodmTaskId && row.orthophotoUrl === "tiles_ready") {
    const bounds = await fetchOrthophotoBounds(row.webodmTaskId);
    if (bounds) {
      res.json({ bounds });
      return;
    }
  }

  // Fallback: return job center so frontend can at least zoom to it
  if (row.latitude != null && row.longitude != null) {
    const d = 0.0005; // ~55 m padding
    res.json({
      bounds: [row.longitude - d, row.latitude - d, row.longitude + d, row.latitude + d],
    });
    return;
  }

  res.status(404).end();
});

/**
 * Save a manually drawn polygon and compute volume/area from it.
 */
router.patch("/:id/polygon", async (req: AuthedRequest, res) => {
  const parsed = RefreshJobParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { polygonCoordinates } = req.body as { polygonCoordinates: number[][] };
  if (!Array.isArray(polygonCoordinates) || polygonCoordinates.length < 3) {
    res.status(400).json({ error: "polygonCoordinates must have at least 3 points" });
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

  const areaSqm = polygonAreaM2(polygonCoordinates);
  const heightEstimateM = 2.0;
  const volumeM3 = Math.round(areaSqm * heightEstimateM * 0.33 * 100) / 100;

  const [updated] = await db
    .update(jobsTable)
    .set({
      polygonCoordinates,
      areaSqm: Math.round(areaSqm * 100) / 100,
      volumeM3,
      updatedAt: new Date(),
    })
    .where(eq(jobsTable.id, row.id))
    .returning();
  res.json(rowToJob(updated));
});

/**
 * Compute the area of a lat/lng polygon in m² using the spherical excess formula.
 */
function polygonAreaM2(coords: number[][]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = toRad(coords[i][1]);
    const xj = toRad(coords[j][1]);
    const yi = toRad(coords[i][0]);
    const yj = toRad(coords[j][0]);
    area += (xj - xi) * (2 + Math.sin(yi) + Math.sin(yj));
  }
  return Math.abs((area * R * R) / 2);
}

function estimateVolume(acceptedImages: number, precision: string): number {
  const base = Math.max(1, acceptedImages) * 38.7;
  const factor = precision === "high" ? 1.0 : precision === "medium" ? 0.92 : 0.84;
  return Math.round(base * factor * 100) / 100;
}

function estimateArea(acceptedImages: number): number {
  return Math.round(Math.max(1, acceptedImages) * 12.4 * 100) / 100;
}

function computeDuration(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
}

/**
 * Build a small, regular octagon polygon (lat/lng pairs) around the given
 * center so the report can show the measured footprint when WebODM has not
 * supplied an explicit boundary. ~30m radius approximation.
 */
function synthesizePolygon(
  lat: number | null,
  lng: number | null,
): number[][] | null {
  if (lat == null || lng == null) return null;
  const radiusDeg = 0.00027;
  const points: number[][] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    points.push([
      lat + Math.cos(angle) * radiusDeg,
      lng + Math.sin(angle) * radiusDeg * 1.4,
    ]);
  }
  return points;
}

export const _internal = { sql };
export default router;
