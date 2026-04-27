import { logger } from "./logger";
import { createWriteStream, createReadStream } from "fs";
import { unlink } from "fs/promises";
import { pipeline } from "stream/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const NODE_BASE = "https://spark1.webodm.net";

/** In-memory token override — set by admin settings API (persisted in DB). */
let _tokenOverride: string | null = null;

/** Called on startup (from app.ts) and after DB token save. */
export function setTokenOverride(t: string | null) {
  _tokenOverride = t;
}

/** Load token override from DB on startup so restarts don't lose it. */
export async function initTokenFromDb() {
  try {
    const { db, appSettingsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "webodm_token"));
    if (rows[0]?.value) {
      _tokenOverride = rows[0].value;
      logger.info("WebODM token loaded from database");
    }
  } catch (err) {
    logger.warn({ err }, "Could not load WebODM token from database — using env var");
  }
}

export type NodeOdmTask = {
  uuid: string;
  name?: string;
  status?: { code: number };
  /** 0–100 integer reported by NodeODM during processing */
  progress?: number;
  processingTime?: number;
  imagesCount?: number;
  available_assets?: string[];
  error?: string;
};

const STATUS_MAP: Record<number, "queued" | "running" | "completed" | "failed"> = {
  10: "queued",
  20: "running",
  30: "failed",
  40: "completed",
  50: "failed",
};

export function statusFromCode(code: number | null | undefined) {
  if (code == null) return "queued" as const;
  return STATUS_MAP[code] ?? ("queued" as const);
}

function token(): string | null {
  return _tokenOverride ?? process.env.WEBODM_LIGHTNING_TOKEN ?? null;
}

/** Append `?token=<t>` (or `&token=<t>`) to a path. */
function qs(path: string): string {
  const t = token();
  if (!t) throw new Error("WEBODM_LIGHTNING_TOKEN is not configured");
  const sep = path.includes("?") ? "&" : "?";
  return `${NODE_BASE}${path}${sep}token=${encodeURIComponent(t)}`;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  if (!token()) throw new Error("WEBODM_LIGHTNING_TOKEN is not configured");
  return fetch(qs(path), init);
}

/**
 * Initialize a new NodeODM task (no images yet).
 * Returns the task UUID or null when no token is configured (demo mode).
 */
export async function createTaskInit(
  name: string,
  opts: { gcpFile?: { name: string; content: string } | null } = {},
): Promise<{ uuid: string } | null> {
  if (!token()) return null;
  try {
    const options: Array<{ name: string; value: unknown }> = [
      // ── Reconstruction quality ─────────────────────────────────────────────
      // feature-quality: how many keypoints are detected per image.
      // pc-quality:      density of the point cloud → directly affects DSM accuracy.
      // Both must be 'high' for reliable volume measurements.
      { name: "feature-quality", value: "high" },
      { name: "pc-quality", value: "high" },

      // ── Output rasters ─────────────────────────────────────────────────────
      // DSM (surface model) and DTM (terrain model) are both required for the
      // triangulated base-surface volume calculation.
      // dem-resolution: explicit DSM/DTM pixel size in cm — do not inherit from
      //   orthophoto-resolution which may differ on some ODM versions.
      { name: "dsm", value: true },
      { name: "dtm", value: true },
      { name: "dem-resolution", value: 5 },
      { name: "orthophoto-resolution", value: 5 },

      // ── Misc ───────────────────────────────────────────────────────────────
      { name: "auto-boundary", value: true },
      // Keep output assets on local disk so our server can fetch them for
      // orthophoto JPEG caching and DSM/DTM byte caching. spark1.webodm.net
      // defaults this to true, which uploads to S3 and deletes local files
      // immediately, making all /assets/* paths return 404 at once.
      { name: "optimize-disk-space", value: false },
    ];

    // ── GCP georeferencing ───────────────────────────────────────────────────
    // When a GCP file is provided:
    //   manual-gcp: true  → tell ODM to use gcp_list.txt for georeferencing
    //   force-gps: false  → do NOT override GCP alignment with image EXIF GPS
    //                       (ODM default is already false; explicit for clarity)
    // For non-GCP jobs we omit both — ODM will use EXIF GPS from images as the
    // only georeferencing source, which is the correct default behaviour.
    if (opts.gcpFile) {
      options.push({ name: "manual-gcp", value: true });
      options.push({ name: "force-gps", value: false });
    }

    const fd = new FormData();
    fd.append("name", name);
    fd.append("options", JSON.stringify(options));
    // NOTE: GCP file is NOT uploaded here. NodeODM ignores files in the init
    // call. The GCP file must be uploaded via /task/new/upload/:uuid with the
    // filename "gcp_list.txt" before committing. See uploadGcpFile().

    const res = await call("/task/new/init", { method: "POST", body: fd });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ status: res.status, body: text }, "NodeODM init task failed");
      return null;
    }
    const data = (await res.json()) as { uuid?: string; error?: string };
    if (data.error || !data.uuid) {
      logger.warn({ data }, "NodeODM init returned error");
      return null;
    }
    return { uuid: data.uuid };
  } catch (err) {
    logger.error({ err }, "NodeODM init task error");
    return null;
  }
}

/**
 * Upload a single base64-encoded image to an existing NodeODM task.
 */
export async function uploadTaskImage(
  uuid: string,
  fileName: string,
  base64Data: string,
  mimeType = "image/jpeg",
): Promise<boolean> {
  if (!token()) return false;
  try {
    const binary = Buffer.from(base64Data, "base64");
    const blob = new Blob([binary], { type: mimeType });
    const fd = new FormData();
    fd.append("images", blob, fileName);

    const res = await call(`/task/new/upload/${uuid}`, { method: "POST", body: fd });
    if (!res.ok) {
      logger.warn({ uuid, fileName, status: res.status }, "NodeODM image upload failed");
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err, uuid, fileName }, "NodeODM upload image error");
    return false;
  }
}

/**
 * Upload a GCP file to an existing NodeODM task.
 *
 * NodeODM identifies the GCP file by its filename — it MUST be named
 * "gcp_list.txt". The file is sent via the same /task/new/upload/:uuid
 * endpoint used for images, using the "images" field.
 *
 * This must be called BEFORE commitTask().
 */
export async function uploadGcpFile(
  uuid: string,
  content: string,
): Promise<boolean> {
  if (!token()) return false;
  try {
    const blob = new Blob([content], { type: "text/plain" });
    const fd = new FormData();
    fd.append("images", blob, "gcp_list.txt");
    const res = await call(`/task/new/upload/${uuid}`, { method: "POST", body: fd });
    if (!res.ok) {
      logger.warn({ uuid, status: res.status }, "NodeODM GCP file upload failed");
      return false;
    }
    logger.info({ uuid }, "GCP file uploaded to NodeODM task");
    return true;
  } catch (err) {
    logger.error({ err, uuid }, "NodeODM GCP file upload error");
    return false;
  }
}

/**
 * Commit a task to start processing (after all images are uploaded).
 */
export async function commitTask(uuid: string): Promise<boolean> {
  if (!token()) return false;
  try {
    const res = await call(`/task/new/commit/${uuid}`, { method: "POST" });
    if (!res.ok) {
      logger.warn({ uuid, status: res.status }, "NodeODM commit task failed");
      return false;
    }
    const data = (await res.json()) as { error?: string };
    if (data.error) {
      logger.warn({ uuid, error: data.error }, "NodeODM commit returned error");
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err, uuid }, "NodeODM commit task error");
    return false;
  }
}

/**
 * Fetch current task status from NodeODM.
 */
export async function getTask(uuid: string): Promise<NodeOdmTask | null> {
  if (!token()) return null;
  try {
    const res = await call(`/task/${uuid}/info`);
    if (!res.ok) return null;
    const data = (await res.json()) as NodeOdmTask;
    if (data.error) {
      logger.warn({ uuid, error: data.error }, "NodeODM task info error");
      return null;
    }
    return data;
  } catch (err) {
    logger.error({ err, uuid }, "NodeODM get task error");
    return null;
  }
}

/**
 * Fetch the bounding box of the orthophoto from the task's boundary file.
 * Returns [west, south, east, north] or null when unavailable.
 */
export async function fetchOrthophotoBounds(
  uuid: string,
): Promise<[number, number, number, number] | null> {
  if (!token()) return null;
  try {
    const res = await call(
      `/task/${uuid}/assets/odm_orthophoto/odm_orthophoto.bounds.geojson`,
    );
    if (!res.ok) {
      // fallback: try the georeferencing geojson for a bounding polygon
      const res2 = await call(
        `/task/${uuid}/assets/odm_georeferencing/odm_georeferencing_model_geo.geojson`,
      );
      if (!res2.ok) return null;
      const geojson = (await res2.json()) as {
        bbox?: number[];
        features?: Array<{ geometry?: { coordinates?: number[][][][] } }>;
      };
      if (geojson.bbox && geojson.bbox.length >= 4) {
        const [w, s, e, n] = geojson.bbox;
        return [w, s, e, n];
      }
      return null;
    }
    const geojson = (await res.json()) as {
      bbox?: number[];
      features?: Array<{ geometry?: { coordinates?: number[][][] } }>;
    };
    if (geojson.bbox && geojson.bbox.length >= 4) {
      const [w, s, e, n] = geojson.bbox;
      return [w, s, e, n];
    }
    // Compute bbox from feature coordinates
    const coords = geojson.features?.[0]?.geometry?.coordinates?.[0];
    if (!coords?.length) return null;
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
  } catch (err) {
    logger.error({ err, uuid }, "NodeODM bounds error");
    return null;
  }
}

/**
 * Remove a task from NodeODM (called when a job is deleted).
 */
export async function deleteTask(uuid: string): Promise<void> {
  if (!token()) return;
  try {
    await call("/task/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid }),
    });
  } catch (err) {
    logger.error({ err, uuid }, "NodeODM delete task error");
  }
}

/**
 * Proxy a single orthophoto tile.
 * NodeODM does not have a built-in tile server — returns null (tile overlay disabled).
 * The polygon-drawer falls back to the Esri satellite basemap.
 */
export async function fetchOrthophotoTile(
  _uuid: string,
  _z: string,
  _x: string,
  _y: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  return null;
}

/**
 * Build the direct NodeODM URL for the orthophoto GeoTIFF asset.
 * Used to proxy/stream the file through our server so the token stays server-side.
 */
export function orthophotoAssetUrl(uuid: string): string {
  const t = token();
  if (!t) throw new Error("WEBODM_LIGHTNING_TOKEN is not configured");
  return `${NODE_BASE}/task/${uuid}/assets/odm_orthophoto/odm_orthophoto.tif?token=${encodeURIComponent(t)}`;
}

/**
 * Convert a GeoTIFF Buffer to a JPEG thumbnail using sharp.
 * Returns a JPEG Buffer ≤800×800 px, or null on failure.
 */
async function tiffToJpeg(tiffBuf: Buffer, uuid: string): Promise<Buffer | null> {
  try {
    const { default: sharp } = await import("sharp");
    return await sharp(tiffBuf, { limitInputPixels: false })
      .flatten({ background: "#ffffff" })
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    logger.error({ err, uuid }, "sharp TIFF→JPEG conversion failed");
    return null;
  }
}

/**
 * Try to download the orthophoto GeoTIFF via the direct asset path.
 * Returns the raw Buffer, or null if unavailable.
 */
async function fetchOrthophotoTiff(uuid: string): Promise<Buffer | null> {
  try {
    const res = await fetch(qs(`/task/${uuid}/assets/odm_orthophoto/odm_orthophoto.tif`));
    if (!res.ok) {
      logger.warn({ uuid, status: res.status }, "Orthophoto GeoTIFF download failed");
      return null;
    }
    const ct = res.headers.get("Content-Type") ?? "";
    if (ct.includes("application/json") || ct.includes("text/")) {
      logger.warn({ uuid, contentType: ct }, "Orthophoto response is not a TIFF (assets expired?)");
      return null;
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength < 1024) {
      logger.warn({ uuid, bytes: ab.byteLength }, "Orthophoto response too small to be a valid TIFF");
      return null;
    }
    return Buffer.from(ab);
  } catch (err) {
    logger.error({ err, uuid }, "Orthophoto fetch error");
    return null;
  }
}

/**
 * Fallback: download the all.zip from NodeODM to a local temp file, then
 * extract odm_orthophoto/odm_orthophoto.tif from it using unzipper.
 *
 * The zip is streamed straight to disk — no in-memory zip buffer.
 * The temp file is always removed in the finally block.
 */
async function fetchOrthophotoTiffFromZip(uuid: string): Promise<Buffer | null> {
  const tmpPath = join(tmpdir(), `pilemetric-${uuid}-${randomUUID()}.zip`);
  try {
    // ── 1. Stream all.zip to a local temp file ──────────────────────────────
    logger.info({ uuid, tmpPath }, "Downloading all.zip to local temp file for orthophoto extraction");
    const res = await fetch(qs(`/task/${uuid}/download/all.zip`), { redirect: "follow" });
    if (!res.ok || !res.body) {
      logger.warn({ uuid, status: res.status }, "all.zip download failed");
      return null;
    }

    await pipeline(
      res.body as unknown as NodeJS.ReadableStream,
      createWriteStream(tmpPath),
    );
    logger.info({ uuid, tmpPath }, "all.zip saved to temp file");

    // ── 2. Open zip from file and locate the orthophoto entry ───────────────
    const unzipper = await import("unzipper");
    const directory = await (unzipper as any).Open.file(tmpPath);

    const entry = (directory.files as Array<{ path: string; stream: () => NodeJS.ReadableStream }>)
      .find((f: { path: string }) => f.path.endsWith("odm_orthophoto.tif"));

    if (!entry) {
      logger.warn({ uuid, entries: (directory.files as any[]).length }, "odm_orthophoto.tif not found in all.zip");
      return null;
    }

    // ── 3. Stream the TIF entry into memory (only the TIF, not the whole zip) ─
    logger.info({ uuid, entry: entry.path }, "Extracting orthophoto from local zip");
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      entry.stream()
        .on("data", (chunk: Buffer) => chunks.push(chunk))
        .on("end", resolve)
        .on("error", reject);
    });

    return Buffer.concat(chunks);
  } catch (err) {
    logger.error({ err, uuid }, "fetchOrthophotoTiffFromZip error");
    return null;
  } finally {
    // Always remove the temp zip file
    unlink(tmpPath).catch(() => {});
  }
}

export type FetchOrthophotoResult = {
  /** JPEG thumbnail buffer, ≤800×800 px. */
  jpeg: Buffer;
  /**
   * Call this AFTER the JPEG has been successfully cached in the database.
   * When the zip fallback was used it permanently deletes the NodeODM task
   * (and its S3 all.zip) so no extracted data lingers anywhere.
   * When the direct asset path was used this is a no-op.
   */
  purge: () => void;
};

/**
 * Download odm_orthophoto.tif from NodeODM and convert it to a JPEG thumbnail
 * using sharp (native libvips — much faster than client-side georaster parsing).
 *
 * Strategy:
 *  1. Try the direct asset path (works when optimize-disk-space=false).
 *  2. Fall back to downloading all.zip to a local temp file, extracting
 *     odm_orthophoto.tif from it, then deleting the temp zip immediately.
 *     (handles tasks that ran with optimize-disk-space=true on spark1.webodm.net).
 *
 * Cleanup guarantee:
 *  - The temp zip file is always deleted by fetchOrthophotoTiffFromZip's finally block.
 *  - All in-memory buffers (tif, jpeg) are released once the function returns.
 *  - The caller MUST invoke result.purge() after writing to DB to permanently
 *    remove the NodeODM task (zip fallback path only).
 *
 * Returns null on failure.
 */
export async function fetchOrthophotoJpeg(uuid: string): Promise<FetchOrthophotoResult | null> {
  if (!token()) return null;

  // 1. Direct asset path (fast path, works for optimize-disk-space=false tasks)
  let tiffBuf = await fetchOrthophotoTiff(uuid);
  let usedZipFallback = false;

  // 2. Fallback: extract from all.zip via S3 redirect
  if (!tiffBuf) {
    logger.info({ uuid }, "Falling back to all.zip extraction for orthophoto");
    tiffBuf = await fetchOrthophotoTiffFromZip(uuid);
    usedZipFallback = !!tiffBuf;
  }

  if (!tiffBuf) return null;

  const jpeg = await tiffToJpeg(tiffBuf, uuid);
  if (!jpeg) return null;

  // tiffBuf is no longer needed — let GC reclaim it immediately
  // (tiffBuf = null would be a type error; simply let it go out of scope)

  const purge = usedZipFallback
    ? () => {
        logger.info({ uuid }, "Purging NodeODM task after zip extraction + DB cache confirmed");
        deleteTask(uuid).catch((err: unknown) =>
          logger.warn({ err, uuid }, "NodeODM task purge failed"),
        );
      }
    : () => { /* direct-path: NodeODM task stays until user deletes the job */ };

  return { jpeg, purge };
}

// ---------------------------------------------------------------------------
// DSM + DTM triangulated base surface volume calculation
// ---------------------------------------------------------------------------

export type VolumeResult = {
  cutM3: number;
  fillM3: number;
  netM3: number;
  areaSqm: number;
  baseline: number;
  pixelCount: number;
  /** true when DTM was used as the per-pixel triangulated base surface */
  triangulated?: boolean;
};

/** Ray-casting point-in-polygon (2-D coordinates). */
function pointInPoly(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

type ParsedRaster = {
  data: Float32Array | Int16Array | Uint16Array | Float64Array;
  width: number;
  height: number;
  bbox: [number, number, number, number];
  noData: number | null;
  geoKeys: Record<string, unknown>;
};

/** Parse a GeoTIFF from an ArrayBuffer (already in memory). */
async function parseGeoTiff(buf: ArrayBuffer, label: string): Promise<ParsedRaster | null> {
  try {
    const { fromArrayBuffer } = await import("geotiff");
    const tiff = await fromArrayBuffer(buf);
    const image = await tiff.getImage();
    const rasters = await image.readRasters({ interleave: false });
    return {
      data: rasters[0] as Float32Array | Int16Array | Uint16Array | Float64Array,
      width: image.getWidth(),
      height: image.getHeight(),
      bbox: image.getBoundingBox() as [number, number, number, number],
      noData: image.getGDALNoData(),
      geoKeys: image.getGeoKeys() as Record<string, unknown>,
    };
  } catch (err) {
    logger.error({ err }, `${label} parse error`);
    return null;
  }
}

/**
 * Download a single GeoTIFF from a URL, returning both the parsed raster
 * and the raw bytes so the caller can cache them.
 * Returns null when the asset is unavailable.
 */
async function fetchGeoTiff(
  url: string,
  label: string,
): Promise<(ParsedRaster & { rawBuf: ArrayBuffer }) | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn({ url, status: res.status }, `${label} download failed`);
      return null;
    }
    const rawBuf = await res.arrayBuffer();
    const parsed = await parseGeoTiff(rawBuf, label);
    if (!parsed) return null;
    return { ...parsed, rawBuf };
  } catch (err) {
    logger.error({ err, url }, `${label} fetch/parse error`);
    return null;
  }
}

/**
 * Build all candidate URLs for a NodeODM/WebODM task asset.
 *
 * spark1.webodm.net runs WebODM Lightning which may move completed task assets
 * to S3 regardless of the `optimize-disk-space` flag. When that happens:
 *   - The raw NodeODM path  (/task/{uuid}/assets/…)         → 404
 *   - The WebODM project API path (/api/projects/1/tasks/…) → 200 (proxied from S3)
 *
 * We always try both, NodeODM path first.
 */
function assetUrls(uuid: string, assetPath: string): string[] {
  return [
    qs(`/task/${uuid}/assets/${assetPath}`),
    qs(`/api/projects/1/tasks/${uuid}/assets/${assetPath}`),
  ];
}

/**
 * Try each URL in order, return the first successful GeoTIFF download.
 */
async function fetchGeoTiffMulti(
  urls: string[],
  label: string,
): Promise<(ParsedRaster & { rawBuf: ArrayBuffer }) | null> {
  for (const url of urls) {
    const result = await fetchGeoTiff(url, label);
    if (result) return result;
  }
  return null;
}

/**
 * Download the DSM (and DTM when available) raw GeoTIFF bytes for a NodeODM
 * task and return them as Buffers for persistent caching.
 * Tries NodeODM path first, then WebODM project API path (for tasks whose
 * assets were migrated to S3 by spark1.webodm.net).
 * Returns null when the DSM is unavailable on both paths.
 */
export async function fetchDsmDtmBuffers(
  uuid: string,
): Promise<{ dsm: Buffer; dtm: Buffer | null } | null> {
  if (!token()) return null;
  const dsm = await fetchGeoTiffMulti(assetUrls(uuid, "odm_dem/dsm.tif"), "DSM");
  if (!dsm) return null;
  const dtm = await fetchGeoTiffMulti(assetUrls(uuid, "odm_dem/dtm.tif"), "DTM");
  return {
    dsm: Buffer.from(dsm.rawBuf),
    dtm: dtm ? Buffer.from(dtm.rawBuf) : null,
  };
}

/** Nearest-neighbour lookup of elevation at a native-CRS coordinate in a raster. */
function sampleRaster(
  x: number,
  y: number,
  raster: { data: Float32Array | Int16Array | Uint16Array | Float64Array; width: number; height: number; bbox: [number, number, number, number]; noData: number | null },
): number | null {
  const { data, width, height, bbox, noData } = raster;
  const pixelW = (bbox[2] - bbox[0]) / width;
  const pixelH = (bbox[3] - bbox[1]) / height;
  const col = Math.round((x - bbox[0]) / pixelW);
  const row = Math.round((bbox[3] - y) / pixelH);
  if (col < 0 || col >= width || row < 0 || row >= height) return null;
  const elev = Number(data[row * width + col]);
  if (noData != null && Math.abs(elev - noData) <= 1e-3) return null;
  if (isNaN(elev) || !isFinite(elev)) return null;
  return elev;
}

// ---------------------------------------------------------------------------
// Shared volume integration kernel
// ---------------------------------------------------------------------------

const MAX_PIXELS = 25_000_000;

/**
 * Core cut/fill integration over parsed DSM + optional DTM rasters.
 * All public entry points delegate here.
 */
async function computeVolumeFromRasters(
  dsm: ParsedRaster,
  dtm: ParsedRaster | null,
  polygonLatLng: number[][],
  logCtx: Record<string, unknown>,
): Promise<VolumeResult | null> {
  if (dsm.width * dsm.height > MAX_PIXELS) {
    logger.warn({ ...logCtx, width: dsm.width, height: dsm.height }, "DSM too large for server-side volume calc");
    return null;
  }

  const triangulated = dtm !== null;
  if (triangulated) {
    logger.info(logCtx, "DTM available — using triangulated base surface for volume calc");
  } else {
    logger.info(logCtx, "DTM unavailable — falling back to flat-plane (min perimeter) baseline");
  }

  const { width, height, bbox } = dsm;
  const pixelW = (bbox[2] - bbox[0]) / width;
  const pixelH = (bbox[3] - bbox[1]) / height;

  // ── Detect CRS & project polygon ────────────────────────────────────────
  const proj4Module = await import("proj4");
  const proj4: (srcProj: string, dstProj: string, coord: [number, number]) => [number, number] =
    (proj4Module.default as any).bind(proj4Module.default) ?? proj4Module.default;

  const epsg: number =
    (dsm.geoKeys as any).ProjectedCSTypeGeoKey ||
    (dsm.geoKeys as any).GeographicTypeGeoKey ||
    4326;

  let polyNative: [number, number][];
  if (epsg === 4326 || epsg === 4269) {
    polyNative = polygonLatLng.map(([lat, lng]) => [lng, lat] as [number, number]);
  } else {
    try {
      polyNative = polygonLatLng.map(([lat, lng]) =>
        proj4(`EPSG:4326`, `EPSG:${epsg}`, [lng, lat]),
      );
    } catch {
      polyNative = polygonLatLng.map(([lat, lng]) => [lng, lat] as [number, number]);
    }
  }

  // ── Pixel-area in m² ────────────────────────────────────────────────────
  let pixelAreaM2: number;
  if (epsg === 4326 || epsg === 4269) {
    const centerLat = ((bbox[1] + bbox[3]) / 2) * (Math.PI / 180);
    const mPerDegLng = 111_319.9 * Math.cos(centerLat);
    const mPerDegLat = 111_319.9;
    pixelAreaM2 = Math.abs(pixelW * mPerDegLng) * Math.abs(pixelH * mPerDegLat);
  } else {
    pixelAreaM2 = Math.abs(pixelW * pixelH);
  }

  // ── Flat-plane fallback baseline (used only when DTM is missing) ─────────
  let flatBaseline = 0;
  if (!triangulated) {
    const perimeterElevations: number[] = [];
    for (const [px, py] of polyNative) {
      const elev = sampleRaster(px, py, dsm);
      if (elev !== null) perimeterElevations.push(elev);
    }
    if (perimeterElevations.length === 0) {
      logger.warn(logCtx, "No valid perimeter elevations found in DSM");
      return null;
    }
    flatBaseline = Math.min(...perimeterElevations);
  }

  // ── Integrate cut / fill over interior DSM pixels ────────────────────────
  let cutM3 = 0;
  let fillM3 = 0;
  let pixelCount = 0;
  let baselineSum = 0;

  const polyXs = polyNative.map((p) => p[0]);
  const polyYs = polyNative.map((p) => p[1]);
  const bboxMinX = Math.max(bbox[0], Math.min(...polyXs));
  const bboxMaxX = Math.min(bbox[2], Math.max(...polyXs));
  const bboxMinY = Math.max(bbox[1], Math.min(...polyYs));
  const bboxMaxY = Math.min(bbox[3], Math.max(...polyYs));

  const colStart = Math.max(0, Math.floor((bboxMinX - bbox[0]) / pixelW));
  const colEnd   = Math.min(width - 1, Math.ceil((bboxMaxX - bbox[0]) / pixelW));
  const rowStart = Math.max(0, Math.floor((bbox[3] - bboxMaxY) / pixelH));
  const rowEnd   = Math.min(height - 1, Math.ceil((bbox[3] - bboxMinY) / pixelH));

  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      const px = bbox[0] + (col + 0.5) * pixelW;
      const py = bbox[3] - (row + 0.5) * pixelH;
      if (!pointInPoly(px, py, polyNative)) continue;

      const surfaceElev = sampleRaster(px, py, dsm);
      if (surfaceElev === null) continue;

      let baseElev: number;
      if (triangulated) {
        const dtmElev = sampleRaster(px, py, dtm!);
        baseElev = dtmElev ?? surfaceElev;
      } else {
        baseElev = flatBaseline;
      }

      const diff = surfaceElev - baseElev;
      if (diff > 0) cutM3  += diff * pixelAreaM2;
      else          fillM3 += Math.abs(diff) * pixelAreaM2;
      baselineSum += baseElev;
      pixelCount++;
    }
  }

  const avgBaseline = pixelCount > 0 ? baselineSum / pixelCount : flatBaseline;

  return {
    cutM3:        Math.round(cutM3 * 100) / 100,
    fillM3:       Math.round(fillM3 * 100) / 100,
    netM3:        Math.round((cutM3 - fillM3) * 100) / 100,
    areaSqm:      Math.round(pixelCount * pixelAreaM2 * 100) / 100,
    baseline:     Math.round(avgBaseline * 1000) / 1000,
    pixelCount,
    triangulated,
  };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Download the NodeODM DSM (and DTM when available) for `uuid`, then compute
 * cut/fill volumes inside `polygonLatLng` (each element is [lat, lng] WGS-84).
 *
 * Returns null when the DSM is unavailable or cannot be parsed.
 * Also returns the raw DSM/DTM bytes via `rawDsm`/`rawDtm` so callers can
 * cache them without a second download.
 */
export async function calculateVolumeFromDSM(
  uuid: string,
  polygonLatLng: number[][],
): Promise<(VolumeResult & { rawDsm: Buffer; rawDtm: Buffer | null }) | null> {
  if (!token()) return null;

  const dsmFetch = await fetchGeoTiffMulti(assetUrls(uuid, "odm_dem/dsm.tif"), "DSM");
  if (!dsmFetch) return null;

  const dtmFetch = await fetchGeoTiffMulti(assetUrls(uuid, "odm_dem/dtm.tif"), "DTM");

  const result = await computeVolumeFromRasters(dsmFetch, dtmFetch, polygonLatLng, { uuid });
  if (!result) return null;

  return {
    ...result,
    rawDsm: Buffer.from(dsmFetch.rawBuf),
    rawDtm: dtmFetch ? Buffer.from(dtmFetch.rawBuf) : null,
  };
}

/**
 * Compute cut/fill volumes using pre-loaded, cached GeoTIFF bytes.
 * This is used for polygon edits after NodeODM task assets have expired.
 *
 * @param dsmBuf  Raw GeoTIFF bytes of the DSM (required)
 * @param dtmBuf  Raw GeoTIFF bytes of the DTM (optional — enables triangulated base)
 * @param polygonLatLng  Polygon vertices as [lat, lng] pairs
 */
export async function calculateVolumeFromBuffers(
  dsmBuf: Buffer,
  dtmBuf: Buffer | null,
  polygonLatLng: number[][],
): Promise<VolumeResult | null> {
  const dsm = await parseGeoTiff(dsmBuf.buffer.slice(dsmBuf.byteOffset, dsmBuf.byteOffset + dsmBuf.byteLength), "DSM (cached)");
  if (!dsm) return null;

  let dtm: ParsedRaster | null = null;
  if (dtmBuf) {
    dtm = await parseGeoTiff(dtmBuf.buffer.slice(dtmBuf.byteOffset, dtmBuf.byteOffset + dtmBuf.byteLength), "DTM (cached)");
  }

  return computeVolumeFromRasters(dsm, dtm, polygonLatLng, { source: "cached-buffers" });
}
