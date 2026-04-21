import type { JobRow, StoredImage } from "@workspace/db";

export function rowToJob(row: JobRow) {
  return {
    id: row.id,
    name: row.name,
    materialType: row.materialType as "sand" | "soil" | "coal",
    sourceType: row.sourceType as "drone" | "smartphone" | "dslr",
    precisionLevel: row.precisionLevel as "low" | "medium" | "high",
    status: row.status as "queued" | "running" | "completed" | "failed",
    progress: row.progress,
    webodmTaskId: row.webodmTaskId ?? null,
    volumeM3: row.volumeM3 ?? null,
    areaSqm: row.areaSqm ?? null,
    orthophotoUrl: row.orthophotoUrl ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    notes: row.notes ?? null,
    imageCount: row.imageCount,
    acceptedImageCount: row.acceptedImageCount,
    images: (row.images ?? []) as StoredImage[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}
