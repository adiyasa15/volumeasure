import { db, activityLogsTable } from "@workspace/db";

export type LogEvent =
  | "login"
  | "login_failed"
  | "logout"
  | "job_created"
  | "job_deleted"
  | "volume_calculated"
  | "orthophoto_generated"
  | "user_approved"
  | "user_suspended"
  | "user_role_changed"
  | "token_updated"
  | "error";

export interface LogEntry {
  level?: "info" | "warn" | "error";
  event: LogEvent;
  userId?: string;
  userEmail?: string;
  jobId?: string;
  message: string;
  meta?: Record<string, unknown>;
}

export async function log(entry: LogEntry): Promise<void> {
  try {
    await db.insert(activityLogsTable).values({
      level: entry.level ?? "info",
      event: entry.event,
      userId: entry.userId ?? null,
      userEmail: entry.userEmail ?? null,
      jobId: entry.jobId ? entry.jobId as any : null,
      message: entry.message,
      meta: entry.meta ?? null,
    });
  } catch {
    // Never throw — logging must not break the main flow
  }
}
