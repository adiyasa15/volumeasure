import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
} from "drizzle-orm/pg-core";

export type UserRole = "super_admin" | "admin" | "user" | "readonly";
export type UserStatus = "pending" | "approved" | "suspended";

export const userProfilesTable = pgTable(
  "user_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").unique(),
    username: text("username").unique(),
    passwordHash: text("password_hash"),
    email: text("email"),
    displayName: text("display_name"),
    role: text("role").notNull().default("user"),
    status: text("status").notNull().default("pending"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    clerkIdx: index("user_profiles_clerk_user_id_idx").on(t.clerkUserId),
  }),
);

export type UserProfileRow = typeof userProfilesTable.$inferSelect;
