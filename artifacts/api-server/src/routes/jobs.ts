import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, not } from "drizzle-orm";
import { db, jobsTable, userProfilesTable, type StoredImage } from "@workspace/db";
import {
  CreateJobBody,
  GetJobParams,
  DeleteJobParams,
  RefreshJobParams,
} from "@workspace/api-zod";
import { rowToJob } from "../lib/jobMapper";
import { logger } from "../lib/logger";
import { Readable } from "stream";
import {
  createTaskInit,
  getTask,
  statusFromCode,
  fetchOrthophotoTile,
  fetchOrthophotoBounds,
  uploadTaskImage,
  uploadGcpFile,
  commitTask,
  deleteTask,
  orthophotoAssetUrl,
  calculateVolumeFromDSM,
  fetchOrthophotoJpeg,
} from "../lib/webodm";
import multer from "multer";
import {
  requireAuth,
  requireApproved,
  requireUser,
  type AuthedRequest,
} from "../lib/roleAuth";

const router: IRouter = Router();
router.use(requireAuth, requireApproved);

/** Multer instance — keeps files in memory for NodeODM proxying. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB per image
});

// ---------------------------------------------------------------------------
// GET /api/jobs — list jobs, filtered by role
// super_admin → all jobs
// admin → own + all ordinary-user (role=user/readonly) jobs
// user/readonly → own jobs only
// ---------------------------------------------------------------------------
router.get("/", async (req: AuthedRequest, res) => {
  const role = req.userRole!;

  if (role === "super_admin") {
    // All jobs
    const rows = await db
      .select()
      .from(jobsTable)
      .orderBy(desc(jobsTable.createdAt));
    res.json(rows.map(rowToJob));
    return;
  }

  if (role === "admin") {
    // Own jobs + all ordinary-user jobs (exclude super_admin & other admin user IDs)
    const adminAndSuperIds = await db
      .select({ clerkUserId: userProfilesTable.clerkUserId })
      .from(userProfilesTable)
      .where(inArray(userProfilesTable.role, ["super_admin", "admin"]));
    const excludeIds = adminAndSuperIds
      .map((r) => r.clerkUserId)
      .filter(Boolean) as string[];

    let rows;
    if (excludeIds.length === 0) {
      rows = await db.select().from(jobsTable).orderBy(desc(jobsTable.createdAt));
    } else {
      // Include own jobs + jobs not belonging to excluded users
      rows = await db
        .select()
        .from(jobsTable)
        .where(
          and(
            not(inArray(jobsTable.userId, excludeIds.filter((id) => id !== req.userId!)))
          ),
        )
        .orderBy(desc(jobsTable.createdAt));
    }
    res.json(rows.map(rowToJob));
    return;
  }

  // user / readonly — own only
  const rows = await db
    .select()
    .from(jobsTable)
    .where(eq(jobsTable.userId, req.userId!))
    .orderBy(desc(jobsTable.createdAt));
  res.json(rows.map(rowToJob));
});

// ---------------------------------------------------------------------------
// POST /api/jobs — create a job shell + NodeODM task, return job ID
// Images are NOT uploaded here; use POST /:id/images + POST /:id/commit next.
// ---------------------------------------------------------------------------
router.post("/", requireUser, async (req: AuthedRequest, res) => {
  const parsed = CreateJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
    return;
  }
  const body = parsed.data;
  const accepted = body.images.filter((i) => i.accepted).length;
  const gcpFile = body.gcpFile ?? null;

  // Initialize a NodeODM task (no images yet — images come via /:id/images)
  const init = await createTaskInit(body.name, {
    gcpFile: gcpFile ? { name: gcpFile.name, content: gcpFile.content } : null,
  });

  const webodmGcpUrl =
    gcpFile && init?.uuid
      ? `https://spark1.webodm.net/task/${init.uuid}/assets/gcp_list.txt?token=${process.env.WEBODM_LIGHTNING_TOKEN ?? ""}`
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

// ---------------------------------------------------------------------------
// GET /api/jobs/:id — fetch a single job
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// PATCH /api/jobs/:id — update editable fields (name, notes)
// ---------------------------------------------------------------------------
router.patch("/:id", requireUser, async (req: AuthedRequest, res) => {
  const parsed = GetJobParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const { name, notes } = req.body as { name?: string; notes?: string };
  if (!name && notes === undefined) {
    res.status(400).json({ error: "Provide at least name or notes" });
    return;
  }
  const updateFields: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof name === "string" && name.trim()) updateFields.name = name.trim();
  if (typeof notes === "string") updateFields.notes = notes.trim() || null;

  const [updated] = await db
    .update(jobsTable)
    .set(updateFields as any)
    .where(and(eq(jobsTable.id, parsed.data.id), eq(jobsTable.userId, req.userId!)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(rowToJob(updated));
});

// ---------------------------------------------------------------------------
// DELETE /api/jobs/:id — delete job + remove NodeODM task
// ---------------------------------------------------------------------------
router.delete("/:id", requireUser, async (req: AuthedRequest, res) => {
  const parsed = DeleteJobParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select({ webodmTaskId: jobsTable.webodmTaskId })
    .from(jobsTable)
    .where(and(eq(jobsTable.id, parsed.data.id), eq(jobsTable.userId, req.userId!)))
    .limit(1);

  // Remove from NodeODM first (best-effort, don't block on failure)
  if (row?.webodmTaskId) {
    deleteTask(row.webodmTaskId).catch(() => {});
  }

  await db
    .delete(jobsTable)
    .where(and(eq(jobsTable.id, parsed.data.id), eq(jobsTable.userId, req.userId!)));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// POST /api/jobs/:id/images — upload one or more images to NodeODM task
// Accepts multipart/form-data with field name "images" (multiple files OK).
// ---------------------------------------------------------------------------
router.post(
  "/:id/images",
  requireUser,
  upload.array("images", 500),
  async (req: AuthedRequest & { files?: Express.Multer.File[] }, res) => {
    const { id } = req.params;
    const [row] = await db
      .select()
      .from(jobsTable)
      .where(and(eq(jobsTable.id, id), eq(jobsTable.userId, req.userId!)))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!row.webodmTaskId) {
      res.status(400).json({ error: "No NodeODM task associated with this job (demo mode)" });
      return;
    }

    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0) {
      res.status(400).json({ error: "No images provided" });
      return;
    }

    const results: Array<{ name: string; ok: boolean }> = [];
    for (const file of files) {
      const base64 = file.buffer.toString("base64");
      const ok = await uploadTaskImage(
        row.webodmTaskId,
        file.originalname,
        base64,
        file.mimetype,
      );
      results.push({ name: file.originalname, ok });
    }

    const failed = results.filter((r) => !r.ok).map((r) => r.name);
    if (failed.length === files.length) {
      res.status(502).json({ error: "All image uploads failed", failed });
      return;
    }

    res.json({ uploaded: results.filter((r) => r.ok).length, failed });
  },
);

// ---------------------------------------------------------------------------
// POST /api/jobs/:id/commit — start NodeODM processing after all images uploaded
// ---------------------------------------------------------------------------
router.post("/:id/commit", requireUser, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const [row] = await db
    .select()
    .from(jobsTable)
    .where(and(eq(jobsTable.id, id), eq(jobsTable.userId, req.userId!)))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!row.webodmTaskId) {
    res.status(400).json({ error: "No NodeODM task associated with this job (demo mode)" });
    return;
  }

  // If the job has a GCP file, upload it now before committing.
  // NodeODM detects the GCP file by its filename "gcp_list.txt" in the upload
  // endpoint — it cannot be sent via the init call.
  if (row.gcpFileContent) {
    const gcpOk = await uploadGcpFile(row.webodmTaskId, row.gcpFileContent);
    if (!gcpOk) {
      logger.warn({ jobId: row.id }, "GCP file upload failed — proceeding without GCP");
    }
  }

  const ok = await commitTask(row.webodmTaskId);
  if (!ok) {
    res.status(502).json({ error: "NodeODM commit failed — ensure images were uploaded first" });
    return;
  }

  // Update job status to reflect it is now actively queued on the node
  const [updated] = await db
    .update(jobsTable)
    .set({ status: "queued", updatedAt: new Date() })
    .where(eq(jobsTable.id, row.id))
    .returning();

  res.json(rowToJob(updated));
});

// ---------------------------------------------------------------------------
// POST /api/jobs/:id/refresh — poll NodeODM for the latest status
// Falls back to a simulated demo progression when no NodeODM task exists.
// ---------------------------------------------------------------------------
router.post("/:id/refresh", requireUser, async (req: AuthedRequest, res) => {
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
  let nextCutVolume = row.cutVolumeM3;
  let nextFillVolume = row.fillVolumeM3;
  let nextArea = row.areaSqm;
  let completedAt = row.completedAt;
  let processingStartedAt = row.processingStartedAt;
  let nextDuration = row.processingDurationSeconds;
  let nextPolygon = row.polygonCoordinates as number[][] | null;
  let nextOrthophotoUrl = row.orthophotoUrl;

  const isManualMode = row.polygonMode === "manual";

  if (row.webodmTaskId) {
    // Real NodeODM task — poll for status
    const task = await getTask(row.webodmTaskId);
    if (task) {
      // NodeODM returns status as { code: number }
      const statusCode = task.status?.code ?? null;
      nextStatus = statusFromCode(statusCode);

      // NodeODM reports `progress` as a 0–100 integer (confirmed from API)
      nextProgress = Math.min(100, Math.max(0, Math.round(task.progress ?? 0)));

      // Record when processing actually starts (first time we see running)
      if (nextStatus === "running" && !processingStartedAt) {
        processingStartedAt = new Date();
      }

      if (nextStatus === "completed") {
        completedAt = completedAt ?? new Date();
        if (nextDuration == null) {
          nextDuration = computeDuration(row.processingStartedAt, completedAt);
        }

        // ── Automatic mode: compute real DSM-based volume using survey bounds ──
        // This runs BEFORE the orthophoto purge so the NodeODM task is still alive.
        if (!isManualMode && nextVolume == null) {
          try {
            const bounds = await fetchOrthophotoBounds(row.webodmTaskId!);
            if (bounds) {
              const boundsPolygon = boundsToPolygonLatLng(bounds);
              const vol = await calculateVolumeFromDSM(row.webodmTaskId!, boundsPolygon);
              if (vol) {
                nextCutVolume  = Math.round(vol.cutM3 * 100) / 100;
                nextFillVolume = Math.round(vol.fillM3 * 100) / 100;
                nextVolume     = Math.round(vol.netM3 * 100) / 100;
                nextArea       = Math.round(vol.areaSqm * 100) / 100;
                nextPolygon    = boundsPolygon;
                logger.info({ jobId: row.id, cutM3: vol.cutM3, fillM3: vol.fillM3, areaSqm: vol.areaSqm },
                  "Automatic DSM volume calculated from survey bounds");
              }
            }
          } catch (err) {
            logger.warn({ err, jobId: row.id }, "Automatic DSM volume failed, using geometric fallback");
          }

          // Geometric fallback when DSM unavailable
          if (nextVolume == null) {
            nextArea   = estimateArea(row.acceptedImageCount);
            nextVolume = Math.round((nextArea ?? 0) * 2.0 * 0.33 * 100) / 100;
            logger.info({ jobId: row.id }, "Using geometric volume estimate (DSM unavailable)");
          }
        }

        if (!nextPolygon) {
          nextPolygon = synthesizePolygon(row.latitude, row.longitude);
        }

        // Signal that NodeODM assets are accessible.  Proactively cache the
        // orthophoto JPEG so it survives asset expiry.  Purge fires only AFTER
        // the DB write succeeds so no data is lost if conversion fails.
        if (!nextOrthophotoUrl) {
          nextOrthophotoUrl = "tiles_ready";
        }
        if (!row.orthophotoJpegB64) {
          try {
            const orthoResult = await fetchOrthophotoJpeg(row.webodmTaskId!);
            if (orthoResult) {
              await db
                .update(jobsTable)
                .set({ orthophotoJpegB64: orthoResult.jpeg.toString("base64") })
                .where(eq(jobsTable.id, row.id));
              logger.info({ jobId: row.id }, "Orthophoto JPEG cached in DB on completion");
              orthoResult.purge();
            }
          } catch (err) {
            logger.warn({ err, jobId: row.id }, "Failed to cache orthophoto JPEG on completion");
          }
        }
      }
    }
  } else {
    // Demo mode — simulate progress over 90 seconds
    const elapsedMs = Date.now() - row.createdAt.getTime();
    const totalMs = 90_000;
    const pct = Math.min(100, Math.floor((elapsedMs / totalMs) * 100));
    nextProgress = pct;
    if (pct < 10) nextStatus = "queued";
    else if (pct < 100) nextStatus = "running";
    else {
      nextStatus = "completed";
      completedAt = completedAt ?? new Date();
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
      cutVolumeM3: nextCutVolume,
      fillVolumeM3: nextFillVolume,
      areaSqm: nextArea,
      orthophotoUrl: nextOrthophotoUrl,
      completedAt,
      processingStartedAt,
      processingDurationSeconds: nextDuration,
      polygonCoordinates: nextPolygon,
      updatedAt: new Date(),
    })
    .where(eq(jobsTable.id, row.id))
    .returning();
  res.json(rowToJob(updated));
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:id/tiles/:z/:x/:y — orthophoto tile proxy (NodeODM stub)
// NodeODM does not serve XYZ tiles natively; returns 404.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// GET /api/jobs/:id/tilejson — orthophoto bounding box for map auto-fly
// ---------------------------------------------------------------------------
router.get("/:id/tilejson", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const [row] = await db
    .select()
    .from(jobsTable)
    .where(and(eq(jobsTable.id, id), eq(jobsTable.userId, req.userId!)))
    .limit(1);

  if (!row) { res.status(404).end(); return; }

  // Try to get real bounds from NodeODM assets
  if (row.webodmTaskId && row.orthophotoUrl === "tiles_ready") {
    const bounds = await fetchOrthophotoBounds(row.webodmTaskId);
    if (bounds) {
      res.json({ bounds });
      return;
    }
  }

  // Fallback: approximate bounds from job GPS center (~55 m padding)
  if (row.latitude != null && row.longitude != null) {
    const d = 0.0005;
    res.json({
      bounds: [row.longitude - d, row.latitude - d, row.longitude + d, row.latitude + d],
    });
    return;
  }

  res.status(404).end();
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:id/orthophoto — stream the completed GeoTIFF from NodeODM
// The token stays server-side; the client receives a plain stream.
// Supports HTTP Range requests for georaster's COG partial reads.
// ---------------------------------------------------------------------------
router.get("/:id/orthophoto", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const [row] = await db
    .select()
    .from(jobsTable)
    .where(and(eq(jobsTable.id, id), eq(jobsTable.userId, req.userId!)))
    .limit(1);

  if (!row) { res.status(404).end(); return; }
  if (!row.webodmTaskId) { res.status(404).json({ error: "No NodeODM task" }); return; }
  if (row.orthophotoUrl !== "tiles_ready") {
    res.status(404).json({ error: "Orthophoto not ready yet" });
    return;
  }

  let url: string;
  try {
    url = orthophotoAssetUrl(row.webodmTaskId);
  } catch {
    res.status(503).json({ error: "NodeODM token not configured" });
    return;
  }

  // Forward Range header so georaster/geotiff.js can do COG partial reads
  const rangeHeader = req.headers.range;
  const fetchHeaders: HeadersInit = {};
  if (rangeHeader) fetchHeaders["Range"] = rangeHeader;

  const upstream = await fetch(url, { headers: fetchHeaders });
  if (!upstream.ok && upstream.status !== 206) {
    res.status(upstream.status).end();
    return;
  }

  res.setHeader("Content-Type", upstream.headers.get("Content-Type") ?? "image/tiff");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, max-age=3600");
  const cl = upstream.headers.get("Content-Length");
  if (cl) res.setHeader("Content-Length", cl);
  const cr = upstream.headers.get("Content-Range");
  if (cr) res.setHeader("Content-Range", cr);

  res.status(upstream.status);

  if (!upstream.body) { res.end(); return; }
  Readable.fromWeb(upstream.body as import("stream/web").ReadableStream).pipe(res);
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:id/orthophoto-jpeg — JPEG thumbnail of the orthophoto
// Downloads odm_orthophoto.tif from NodeODM, converts with sharp server-side.
// Much faster for PDF report embedding than client-side GeoTIFF parsing.
// ---------------------------------------------------------------------------
router.get("/:id/orthophoto-jpeg", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const [row] = await db
    .select()
    .from(jobsTable)
    .where(and(eq(jobsTable.id, id), eq(jobsTable.userId, req.userId!)))
    .limit(1);

  if (!row) { res.status(404).end(); return; }
  if (!row.webodmTaskId) { res.status(404).json({ error: "No NodeODM task" }); return; }
  if (row.orthophotoUrl !== "tiles_ready") {
    res.status(404).json({ error: "Orthophoto not ready yet" });
    return;
  }

  // Serve from DB cache if available (avoids NodeODM asset expiry issues)
  if (row.orthophotoJpegB64) {
    const cached = Buffer.from(row.orthophotoJpegB64, "base64");
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("Content-Length", String(cached.byteLength));
    res.status(200).end(cached);
    return;
  }

  // Not yet cached — try to fetch from NodeODM and cache for next time
  const orthoResult = await fetchOrthophotoJpeg(row.webodmTaskId);
  if (!orthoResult) {
    res.status(404).json({ error: "Orthophoto not available (NodeODM assets may have expired)" });
    return;
  }

  // Save to DB cache so future requests don't need NodeODM, then purge remote data
  db.update(jobsTable)
    .set({ orthophotoJpegB64: orthoResult.jpeg.toString("base64") })
    .where(eq(jobsTable.id, row.id))
    .then(() => {
      // JPEG confirmed in DB — permanently delete NodeODM task + S3 data
      // (purge() is a no-op when the direct asset path was used)
      orthoResult.purge();
      logger.info({ jobId: id }, "Orthophoto JPEG cached and remote data purged");
    })
    .catch((err: Error) => logger.warn({ err, jobId: id }, "Failed to cache orthophoto JPEG"));

  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.setHeader("Content-Length", String(orthoResult.jpeg.byteLength));
  res.status(200).end(orthoResult.jpeg);
});

// ---------------------------------------------------------------------------
// PATCH /api/jobs/:id/polygon — save manual polygon, compute volume + area
// ---------------------------------------------------------------------------
router.patch("/:id/polygon", requireUser, async (req: AuthedRequest, res) => {
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

  // Attempt real DSM-based cut/fill calculation first
  let cutM3: number | null = null;
  let fillM3: number | null = null;
  let netM3: number | null = null;
  let areaSqm: number | null = null;

  if (row.webodmTaskId && row.orthophotoUrl === "tiles_ready") {
    try {
      const vol = await calculateVolumeFromDSM(row.webodmTaskId, polygonCoordinates);
      if (vol) {
        cutM3   = vol.cutM3;
        fillM3  = vol.fillM3;
        netM3   = vol.netM3;
        areaSqm = vol.areaSqm;
      }
    } catch (err) {
      logger.warn({ err, id: row.id }, "DSM volume calculation failed, falling back");
    }
  }

  // Geometric fallback when DSM unavailable
  if (netM3 == null) {
    areaSqm = Math.round(polygonAreaM2(polygonCoordinates) * 100) / 100;
    const heightEstimateM = 2.0;
    netM3 = Math.round(areaSqm * heightEstimateM * 0.33 * 100) / 100;
  }

  const [updated] = await db
    .update(jobsTable)
    .set({
      polygonCoordinates,
      areaSqm,
      volumeM3:      netM3,
      cutVolumeM3:   cutM3,
      fillVolumeM3:  fillM3,
      updatedAt:     new Date(),
    })
    .where(eq(jobsTable.id, row.id))
    .returning();
  res.json(rowToJob(updated));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Area of a lat/lng polygon in m² using spherical excess formula. */
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
 * Convert an orthophoto bounding box [west, south, east, north] (WGS-84) to a
 * 4-corner polygon in [[lat, lng], …] order — matching the convention expected
 * by calculateVolumeFromDSM and the polygon PATCH endpoint.
 */
function boundsToPolygonLatLng(bounds: [number, number, number, number]): number[][] {
  const [west, south, east, north] = bounds;
  return [
    [north, west],
    [north, east],
    [south, east],
    [south, west],
  ];
}

/** Approximate stockpile footprint as a regular octagon (~30 m radius). */
function synthesizePolygon(lat: number | null, lng: number | null): number[][] | null {
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

export default router;
