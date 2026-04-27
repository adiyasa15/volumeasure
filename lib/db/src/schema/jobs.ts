import {
  pgTable,
  text,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
  uuid,
  index,
} from "drizzle-orm/pg-core";

export type StoredImage = {
  name: string;
  sizeBytes: number;
  accepted: boolean;
  rejectionReason?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  sharpnessScore?: number | null;
};

export const jobsTable = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    materialType: text("material_type").notNull(),
    sourceType: text("source_type").notNull(),
    precisionLevel: text("precision_level").notNull().default("high"),
    status: text("status").notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    webodmTaskId: text("webodm_task_id"),
    volumeM3: doublePrecision("volume_m3"),
    cutVolumeM3: doublePrecision("cut_volume_m3"),
    fillVolumeM3: doublePrecision("fill_volume_m3"),
    areaSqm: doublePrecision("area_sqm"),
    orthophotoUrl: text("orthophoto_url"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    notes: text("notes"),
    gcpEnabled: integer("gcp_enabled").notNull().default(0),
    gcpFileName: text("gcp_file_name"),
    gcpFileContent: text("gcp_file_content"),
    webodmGcpUrl: text("webodm_gcp_url"),
    totalFileSizeBytes: doublePrecision("total_file_size_bytes"),
    captureLocation: text("capture_location"),
    captureDate: timestamp("capture_date", { withTimezone: true }),
    processingStartedAt: timestamp("processing_started_at", {
      withTimezone: true,
    }),
    processingDurationSeconds: integer("processing_duration_seconds"),
    polygonMode: text("polygon_mode").notNull().default("automatic"),
    polygonCoordinates: jsonb("polygon_coordinates").$type<number[][]>(),
    imageCount: integer("image_count").notNull().default(0),
    acceptedImageCount: integer("accepted_image_count").notNull().default(0),
    images: jsonb("images").$type<StoredImage[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    orthophotoJpegB64: text("orthophoto_jpeg_b64"),
    /** Raw GeoTIFF bytes for the DSM, base64-encoded. Cached at job completion
     *  so volume can be recalculated after NodeODM task assets expire. */
    dsmCacheB64: text("dsm_cache_b64"),
    /** Raw GeoTIFF bytes for the DTM, base64-encoded. Paired with dsmCacheB64. */
    dtmCacheB64: text("dtm_cache_b64"),
  },
  (table) => ({
    userIdx: index("jobs_user_id_idx").on(table.userId),
    createdAtIdx: index("jobs_created_at_idx").on(table.createdAt),
  }),
);

export type JobRow = typeof jobsTable.$inferSelect;
