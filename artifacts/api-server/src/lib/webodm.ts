import { logger } from "./logger";

const NODE_BASE = "https://spark1.webodm.net";

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
  return process.env.WEBODM_LIGHTNING_TOKEN || null;
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
      { name: "auto-boundary", value: true },
      { name: "dsm", value: true },
      { name: "orthophoto-resolution", value: 5 },
      { name: "feature-quality", value: "high" },
    ];
    // When a GCP file is provided, tell NodeODM to trust GCP over GPS EXIF
    if (opts.gcpFile) {
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
 * Download odm_orthophoto.tif from NodeODM and convert it to a JPEG thumbnail
 * using sharp (native libvips — much faster than client-side georaster parsing).
 * Returns a JPEG Buffer sized ≤800×800 px, or null on failure.
 */
export async function fetchOrthophotoJpeg(uuid: string): Promise<Buffer | null> {
  if (!token()) return null;

  let arrayBuffer: ArrayBuffer;
  try {
    const res = await fetch(qs(`/task/${uuid}/assets/odm_orthophoto/odm_orthophoto.tif`));
    if (!res.ok) {
      logger.warn({ uuid, status: res.status }, "Orthophoto GeoTIFF download failed");
      return null;
    }
    // Guard: NodeODM returns JSON errors with HTTP 200 when assets have expired
    const ct = res.headers.get("Content-Type") ?? "";
    if (ct.includes("application/json") || ct.includes("text/")) {
      logger.warn({ uuid, contentType: ct }, "Orthophoto response is not a TIFF (assets expired?)");
      return null;
    }
    arrayBuffer = await res.arrayBuffer();
    // Minimum sanity check: a GeoTIFF is at least a few KB
    if (arrayBuffer.byteLength < 1024) {
      logger.warn({ uuid, bytes: arrayBuffer.byteLength }, "Orthophoto response too small to be a valid TIFF");
      return null;
    }
  } catch (err) {
    logger.error({ err, uuid }, "Orthophoto fetch error");
    return null;
  }

  try {
    const { default: sharp } = await import("sharp");
    const jpegBuffer = await sharp(Buffer.from(arrayBuffer), { limitInputPixels: false })
      .flatten({ background: "#ffffff" }) // alpha → white (JPEG has no transparency)
      .resize(800, 800, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return jpegBuffer;
  } catch (err) {
    logger.error({ err, uuid }, "sharp TIFF→JPEG conversion failed");
    return null;
  }
}

// ---------------------------------------------------------------------------
// DSM-based cut / fill volume calculation
// ---------------------------------------------------------------------------

export type VolumeResult = {
  cutM3: number;
  fillM3: number;
  netM3: number;
  areaSqm: number;
  baseline: number;
  pixelCount: number;
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

/**
 * Download the NodeODM DSM GeoTIFF for `uuid`, then compute cut/fill volumes
 * inside `polygonLatLng` (each element is [lat, lng] in WGS-84 degrees).
 *
 * Baseline = minimum elevation sampled at the polygon perimeter vertices.
 * Returns null when the DSM is unavailable or cannot be parsed.
 */
export async function calculateVolumeFromDSM(
  uuid: string,
  polygonLatLng: number[][],
): Promise<VolumeResult | null> {
  if (!token()) return null;

  // ── 1. Download DSM ──────────────────────────────────────────────────────
  const dsmUrl = qs(`/task/${uuid}/assets/odm_dem/dsm.tif`);
  let arrayBuffer: ArrayBuffer;
  try {
    const res = await fetch(dsmUrl);
    if (!res.ok) {
      logger.warn({ uuid, status: res.status }, "DSM download failed");
      return null;
    }
    arrayBuffer = await res.arrayBuffer();
  } catch (err) {
    logger.error({ err, uuid }, "DSM fetch error");
    return null;
  }

  // ── 2. Parse GeoTIFF ─────────────────────────────────────────────────────
  const { fromArrayBuffer } = await import("geotiff");
  const proj4Module = await import("proj4");
  const proj4: (srcProj: string, dstProj: string, coord: [number, number]) => [number, number] =
    (proj4Module.default as any).bind(proj4Module.default) ?? proj4Module.default;

  const tiff = await fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();

  const width = image.getWidth();
  const height = image.getHeight();
  const MAX_PIXELS = 25_000_000; // ~5 000 × 5 000 guard
  if (width * height > MAX_PIXELS) {
    logger.warn({ uuid, width, height }, "DSM too large for server-side volume calc");
    return null;
  }

  // Bounding box in native CRS [west, south, east, north]
  const bbox = image.getBoundingBox() as [number, number, number, number];
  const pixelW = (bbox[2] - bbox[0]) / width;
  const pixelH = (bbox[3] - bbox[1]) / height;

  // No-data value (null when absent)
  const noDataValue = image.getGDALNoData();

  // Read first band (elevation)
  const rasters = await image.readRasters({ interleave: false });
  const data = rasters[0] as Float32Array | Int16Array | Uint16Array | Float64Array;

  // ── 3. Detect CRS & project polygon ─────────────────────────────────────
  const geoKeys = image.getGeoKeys();
  const epsg: number =
    (geoKeys as any).ProjectedCSTypeGeoKey ||
    (geoKeys as any).GeographicTypeGeoKey ||
    4326;

  // Convert polygon [lat, lng] → native CRS [x, y]
  let polyNative: [number, number][];
  if (epsg === 4326 || epsg === 4269) {
    // Geographic — just swap to [lng, lat]
    polyNative = polygonLatLng.map(([lat, lng]) => [lng, lat] as [number, number]);
  } else {
    // Projected — use proj4; fall back gracefully if EPSG is unknown
    try {
      polyNative = polygonLatLng.map(([lat, lng]) =>
        proj4(`EPSG:4326`, `EPSG:${epsg}`, [lng, lat]),
      );
    } catch {
      // proj4 doesn't know this EPSG: use plain bbox ratio to estimate
      polyNative = polygonLatLng.map(([lat, lng]) => [lng, lat] as [number, number]);
    }
  }

  // ── 4. Pixel-area in m² ──────────────────────────────────────────────────
  let pixelAreaM2: number;
  if (epsg === 4326 || epsg === 4269) {
    const centerLat = ((bbox[1] + bbox[3]) / 2) * (Math.PI / 180);
    const mPerDegLng = 111_319.9 * Math.cos(centerLat);
    const mPerDegLat = 111_319.9;
    pixelAreaM2 = Math.abs(pixelW * mPerDegLng) * Math.abs(pixelH * mPerDegLat);
  } else {
    // Projected CRS: units are metres
    pixelAreaM2 = Math.abs(pixelW * pixelH);
  }

  // ── 5. Baseline = min elevation at polygon perimeter ────────────────────
  const perimeterElevations: number[] = [];
  for (const [px, py] of polyNative) {
    const col = Math.round((px - bbox[0]) / pixelW);
    const row = Math.round((bbox[3] - py) / pixelH);
    if (col >= 0 && col < width && row >= 0 && row < height) {
      const elev = Number(data[row * width + col]);
      if (noDataValue == null || Math.abs(elev - noDataValue) > 1e-3) {
        if (!isNaN(elev) && isFinite(elev)) perimeterElevations.push(elev);
      }
    }
  }
  if (perimeterElevations.length === 0) {
    logger.warn({ uuid }, "No valid perimeter elevations found in DSM");
    return null;
  }
  const baseline = Math.min(...perimeterElevations);

  // ── 6. Integrate cut / fill over interior pixels ─────────────────────────
  let cutM3 = 0;
  let fillM3 = 0;
  let pixelCount = 0;

  // Clamp iteration to polygon bounding box for performance
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
      // Pixel centre in native CRS
      const px = bbox[0] + (col + 0.5) * pixelW;
      const py = bbox[3] - (row + 0.5) * pixelH;

      if (!pointInPoly(px, py, polyNative)) continue;

      const elev = Number(data[row * width + col]);
      if (noDataValue != null && Math.abs(elev - noDataValue) <= 1e-3) continue;
      if (isNaN(elev) || !isFinite(elev)) continue;

      const diff = elev - baseline;
      if (diff > 0) cutM3  += diff * pixelAreaM2;
      else          fillM3 += Math.abs(diff) * pixelAreaM2;
      pixelCount++;
    }
  }

  return {
    cutM3:      Math.round(cutM3 * 100) / 100,
    fillM3:     Math.round(fillM3 * 100) / 100,
    netM3:      Math.round((cutM3 - fillM3) * 100) / 100,
    areaSqm:    Math.round(pixelCount * pixelAreaM2 * 100) / 100,
    baseline:   Math.round(baseline * 1000) / 1000,
    pixelCount,
  };
}
