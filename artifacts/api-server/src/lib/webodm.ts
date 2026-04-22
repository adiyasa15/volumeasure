import { logger } from "./logger";

const WEBODM_BASE = "https://webodm.net";

export type WebodmTask = {
  uuid: string;
  status: number | null;
  running_progress: number;
  available_assets?: string[];
  processing_node?: number;
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

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const t = token();
  if (!t) throw new Error("WEBODM_LIGHTNING_TOKEN is not configured");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `JWT ${t}`);
  return fetch(`${WEBODM_BASE}${path}`, { ...init, headers });
}

/**
 * Create a new processing task. The Lightning API expects a multipart upload
 * with the images and an "options" JSON. For first-build we initialize the
 * task with options and an "auto-boundary" workflow flag, but the actual
 * image upload is performed client-side or skipped (placeholder behavior).
 *
 * Returns null when no token is configured (the route handler then runs in
 * "demo" mode and reports status as queued without contacting WebODM).
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
      options.push({ name: "dmanual-gcp", value: true });
    }
    const fd = new FormData();
    fd.append("name", name);
    fd.append("options", JSON.stringify(options));
    fd.append("partial", "true");
    if (opts.gcpFile) {
      const blob = new Blob([opts.gcpFile.content], { type: "text/plain" });
      fd.append("gcp", blob, opts.gcpFile.name || "gcp_list.txt");
    }
    const res = await call("/api/projects/init/task/", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "WebODM init task failed");
      return null;
    }
    const data = (await res.json()) as { uuid: string };
    return { uuid: data.uuid };
  } catch (err) {
    logger.error({ err }, "WebODM init task error");
    return null;
  }
}

export async function getTask(uuid: string): Promise<WebodmTask | null> {
  if (!token()) return null;
  try {
    const res = await call(`/api/projects/init/task/${uuid}/`);
    if (!res.ok) return null;
    return (await res.json()) as WebodmTask;
  } catch (err) {
    logger.error({ err, uuid }, "WebODM get task error");
    return null;
  }
}
