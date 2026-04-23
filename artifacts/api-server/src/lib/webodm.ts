import { logger } from "./logger";

const NODE_BASE = "https://spark1.webodm.net";

export type NodeOdmTask = {
  uuid: string;
  name?: string;
  status?: { code: number };
  running_progress?: number;
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
    if (opts.gcpFile) {
      options.push({ name: "use-exif-size", value: false });
    }

    const fd = new FormData();
    fd.append("name", name);
    fd.append("options", JSON.stringify(options));

    if (opts.gcpFile) {
      const blob = new Blob([opts.gcpFile.content], { type: "text/plain" });
      fd.append("gcp", blob, opts.gcpFile.name || "gcp_list.txt");
    }

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
