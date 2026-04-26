import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const appSettingsTable = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by"),
});

export type AppSettingRow = typeof appSettingsTable.$inferSelect;
