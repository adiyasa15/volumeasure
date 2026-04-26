import type { JobRow, StoredImage } from "@workspace/db";

export function rowToJob(row: JobRow, ownerName?: string | null, ownerEmail?: string | null) {
  return {
    ownerName: ownerName ?? null,
    ownerEmail: ownerEmail ?? null,
    id: row.id,
    name: row.name,
    materialType: row.materialType as "sand" | "soil" | "coal",
    sourceType: row.sourceType as "drone" | "smartphone" | "dslr",
    precisionLevel: row.precisionLevel as "low" | "medium" | "high",
    status: row.status as "queued" | "running" | "completed" | "failed",
    progress: row.progress,
    webodmTaskId: row.webodmTaskId ?? null,
    volumeM3: row.volumeM3 ?? null,
    cutVolumeM3: row.cutVolumeM3 ?? null,
    fillVolumeM3: row.fillVolumeM3 ?? null,
    areaSqm: row.areaSqm ?? null,
    orthophotoUrl: row.orthophotoUrl ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    notes: row.notes ?? null,
    polygonMode: (row.polygonMode ?? "automatic") as "automatic" | "manual",
    gcpEnabled: row.gcpEnabled === 1,
    webodmGcpUrl: row.webodmGcpUrl ?? null,
    totalFileSizeBytes: row.totalFileSizeBytes ?? null,
    captureLocation: row.captureLocation ?? null,
    captureDate: row.captureDate ? row.captureDate.toISOString() : null,
    processingStartedAt: row.processingStartedAt
      ? row.processingStartedAt.toISOString()
      : null,
    processingDurationSeconds: row.processingDurationSeconds ?? null,
    polygonCoordinates: (row.polygonCoordinates as number[][] | null) ?? null,
    imageCount: row.imageCount,
    acceptedImageCount: row.acceptedImageCount,
    images: (row.images ?? []) as StoredImage[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}
