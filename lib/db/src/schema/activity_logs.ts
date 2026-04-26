import { pgTable, text, timestamp, uuid, index, jsonb } from "drizzle-orm/pg-core";

export const activityLogsTable = pgTable(
  "activity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    level: text("level").notNull().default("info"),
    event: text("event").notNull(),
    userId: text("user_id"),
    userEmail: text("user_email"),
    jobId: uuid("job_id"),
    message: text("message").notNull(),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdAtIdx: index("activity_logs_created_at_idx").on(t.createdAt),
    eventIdx: index("activity_logs_event_idx").on(t.event),
    userIdIdx: index("activity_logs_user_id_idx").on(t.userId),
  }),
);

export type ActivityLogRow = typeof activityLogsTable.$inferSelect;
