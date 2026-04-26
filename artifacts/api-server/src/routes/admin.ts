import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, ne, or, inArray, not, desc } from "drizzle-orm";
import { db, userProfilesTable, appSettingsTable, activityLogsTable } from "@workspace/db";
import type { UserRole, UserStatus } from "@workspace/db";
import bcrypt from "bcryptjs";
import {
  requireAuth,
  requireApproved,
  requireAdmin,
  requireSuperAdmin,
  signLocalJwt,
  canManageRole,
  canSetRole,
  type AuthedRequest,
} from "../lib/roleAuth";
import { log } from "../lib/activityLog";
import { setTokenOverride } from "../lib/webodm";

const router: IRouter = Router();

// ── POST /api/admin/auth/login — local username/password login ──────────────
router.post("/auth/login", async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: "username and password required" });
    return;
  }
  // Accept login by username OR email address
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(
      or(
        eq(userProfilesTable.username, username),
        eq(userProfilesTable.email, username),
      ),
    )
    .limit(1);

  if (!profile || !profile.passwordHash) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const valid = await bcrypt.compare(password, profile.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (profile.status !== "approved") {
    res.status(403).json({ error: "Account not approved" });
    return;
  }
  const token = signLocalJwt(profile.id);
  void log({ event: "login", userId: profile.username ?? profile.id, userEmail: profile.email ?? undefined, message: `Local admin login: ${profile.username ?? profile.email}` });
  res.json({
    token,
    profile: {
      id: profile.id,
      username: profile.username,
      email: profile.email,
      displayName: profile.displayName,
      role: profile.role,
      status: profile.status,
    },
  });
});

// ── GET /api/admin/me — own profile (auth required, approval NOT required) ───
router.get("/me", requireAuth, async (req: AuthedRequest, res: Response) => {
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.id, req.userProfileId!))
    .limit(1);
  if (!profile) { res.status(404).json({ error: "Not found" }); return; }
  res.json(rowToProfile(profile));
});

// All routes below require auth + approved status
router.use(requireAuth, requireApproved);

// ── GET /api/admin/users — list users ───────────────────────────────────────
router.get("/users", requireAdmin, async (req: AuthedRequest, res: Response) => {
  const role = req.userRole!;

  let rows;
  if (role === "super_admin") {
    rows = await db.select().from(userProfilesTable);
  } else {
    // admin: sees only non-super_admin, non-admin users (and themselves)
    rows = await db
      .select()
      .from(userProfilesTable)
      .where(
        not(inArray(userProfilesTable.role, ["super_admin", "admin"]))
      );
  }
  res.json(rows.map(rowToProfile));
});

// ── POST /api/admin/users — create user ─────────────────────────────────────
router.post("/users", requireAdmin, async (req: AuthedRequest, res: Response) => {
  const { email, displayName, role, status, password } = req.body as {
    email?: string;
    displayName?: string;
    role?: string;
    status?: string;
    password?: string;
  };

  if (!email) { res.status(400).json({ error: "email required" }); return; }

  const targetRole = (role ?? "user") as UserRole;
  if (!canSetRole(req.userRole!, targetRole)) {
    res.status(403).json({ error: "Cannot assign this role" });
    return;
  }

  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  const [created] = await db
    .insert(userProfilesTable)
    .values({
      email,
      displayName: displayName ?? email,
      role: targetRole,
      status: (status as UserStatus) ?? "approved",
      createdBy: req.userProfileId,
      ...(passwordHash ? { passwordHash } : {}),
    })
    .returning();

  res.status(201).json(rowToProfile(created));
});

// ── PATCH /api/admin/users/:id — update role/status ─────────────────────────
router.patch("/users/:id", requireAdmin, async (req: AuthedRequest, res: Response) => {
  const { id } = req.params;
  const { role, status, displayName, email } = req.body as {
    role?: string;
    status?: string;
    displayName?: string;
    email?: string;
  };

  const [target] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.id, id))
    .limit(1);

  if (!target) { res.status(404).json({ error: "Not found" }); return; }

  // Cannot edit self through this endpoint (use /me)
  if (target.id === req.userProfileId) {
    res.status(400).json({ error: "Cannot edit own account via admin panel" });
    return;
  }

  // Check actor can manage this target
  if (!canManageRole(req.userRole!, target.role as UserRole)) {
    res.status(403).json({ error: "Cannot manage this user" });
    return;
  }

  // Check new role is allowed
  if (role && !canSetRole(req.userRole!, role as UserRole)) {
    res.status(403).json({ error: "Cannot assign this role" });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (role) updates.role = role;
  if (status) updates.status = status;
  if (displayName) updates.displayName = displayName;
  if (email) updates.email = email;

  const [updated] = await db
    .update(userProfilesTable)
    .set(updates as any)
    .where(eq(userProfilesTable.id, id))
    .returning();

  if (status && status !== target.status) {
    void log({ event: status === "approved" ? "user_approved" : "user_suspended", userId: req.userId, userEmail: updated.email ?? undefined, message: `User ${updated.email ?? id} status changed to ${status} by ${req.userId}` });
  }
  if (role && role !== target.role) {
    void log({ event: "user_role_changed", userId: req.userId, userEmail: updated.email ?? undefined, message: `User ${updated.email ?? id} role changed to ${role} by ${req.userId}` });
  }

  res.json(rowToProfile(updated));
});

// ── DELETE /api/admin/users/:id — delete user ───────────────────────────────
router.delete("/users/:id", requireAdmin, async (req: AuthedRequest, res: Response) => {
  const { id } = req.params;
  const [target] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.id, id))
    .limit(1);

  if (!target) { res.status(404).json({ error: "Not found" }); return; }
  if (target.id === req.userProfileId) {
    res.status(400).json({ error: "Cannot delete own account" });
    return;
  }
  if (!canManageRole(req.userRole!, target.role as UserRole)) {
    res.status(403).json({ error: "Cannot delete this user" });
    return;
  }

  await db.delete(userProfilesTable).where(eq(userProfilesTable.id, id));
  res.status(204).end();
});

// ── GET /api/admin/settings — get current settings [super_admin] ─────────────
router.get("/settings", requireSuperAdmin, async (_req: AuthedRequest, res: Response) => {
  const rows = await db.select().from(appSettingsTable);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const rawToken = map["webodm_token"] ?? process.env.WEBODM_LIGHTNING_TOKEN ?? "";
  const masked = rawToken.length > 8
    ? rawToken.slice(0, 4) + "•".repeat(Math.min(rawToken.length - 8, 24)) + rawToken.slice(-4)
    : rawToken ? "••••••••" : "";
  res.json({
    webodmToken: { masked, source: map["webodm_token"] ? "database" : "environment" },
    webodmUrl: "https://spark1.webodm.net",
  });
});

// ── PUT /api/admin/settings/webodm-token — update WebODM token ───────────────
router.put("/settings/webodm-token", requireSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const { token } = req.body as { token?: string };
  if (!token || token.trim().length < 8) {
    res.status(400).json({ error: "Token must be at least 8 characters" });
    return;
  }
  const trimmed = token.trim();
  await db
    .insert(appSettingsTable)
    .values({ key: "webodm_token", value: trimmed, updatedBy: req.userProfileId ? req.userProfileId as any : undefined })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: trimmed, updatedAt: new Date(), updatedBy: req.userProfileId ? req.userProfileId as any : undefined } });
  setTokenOverride(trimmed);
  void log({ event: "token_updated", userId: req.userId, message: "WebODM API token updated" });
  res.json({ ok: true });
});

// ── Env var catalog ──────────────────────────────────────────────────────────
const ENV_CATALOG = [
  // ── Application ────────────────────────────────────────────────────────────
  { key: "SESSION_SECRET",        category: "Application",   label: "Session Secret",            description: "JWT signing secret for local admin sessions. Requires server restart.", sensitive: true,  editable: true,  requiresRestart: true  },
  { key: "LOG_LEVEL",             category: "Application",   label: "Log Level",                 description: "Pino log level: trace / debug / info / warn / error", sensitive: false, editable: true,  requiresRestart: false },
  { key: "NODE_ENV",              category: "Application",   label: "Node Environment",          description: "Runtime mode (development / production). Set by the run script.", sensitive: false, editable: false, requiresRestart: true  },
  { key: "PORT",                  category: "Application",   label: "Port",                      description: "Server listening port. Assigned by the platform.", sensitive: false, editable: false, requiresRestart: true  },
  // ── Database ───────────────────────────────────────────────────────────────
  { key: "DATABASE_URL",          category: "Database",      label: "Database URL",              description: "PostgreSQL connection string. Managed by the platform.", sensitive: true,  editable: false, requiresRestart: true  },
  // ── Clerk Auth ─────────────────────────────────────────────────────────────
  { key: "CLERK_SECRET_KEY",      category: "Clerk Auth",    label: "Clerk Secret Key",          description: "Clerk server-side API key. Update in Replit Secrets for production.", sensitive: true,  editable: true,  requiresRestart: true  },
  { key: "CLERK_PUBLISHABLE_KEY", category: "Clerk Auth",    label: "Clerk Publishable Key",     description: "Clerk public key used by the backend proxy.", sensitive: false, editable: true,  requiresRestart: true  },
  // ── WebODM / NodeODM ───────────────────────────────────────────────────────
  { key: "WEBODM_LIGHTNING_TOKEN", category: "WebODM",       label: "WebODM Lightning Token",    description: "Managed via the API Token tab above.", sensitive: true,  editable: false, requiresRestart: false },
] as const;

type EnvKey = (typeof ENV_CATALOG)[number]["key"];

function maskValue(val: string, sensitive: boolean): string {
  if (!val) return "";
  if (!sensitive) return val;
  // Mask credentials inside URLs (e.g. postgresql://user:SECRET@host/db)
  if (val.startsWith("postgresql://") || val.startsWith("postgres://")) {
    return val.replace(/:([^:@/]+)@/, ":••••••••@");
  }
  if (val.length <= 8) return "••••••••";
  return val.slice(0, 4) + "•".repeat(Math.min(val.length - 8, 28)) + val.slice(-4);
}

// ── GET /api/admin/env-vars — environment variable catalog ───────────────────
router.get("/env-vars", requireSuperAdmin, async (_req: AuthedRequest, res: Response) => {
  // Load all DB-stored env overrides
  const dbRows = await db.select().from(appSettingsTable);
  const dbMap = Object.fromEntries(
    dbRows
      .filter((r) => r.key.startsWith("env:"))
      .map((r) => [r.key.slice(4), r.value])
  );

  const result = ENV_CATALOG.map((entry) => {
    const envVal  = process.env[entry.key] ?? "";
    const dbVal   = dbMap[entry.key];
    const current = dbVal ?? envVal;
    return {
      key:             entry.key,
      category:        entry.category,
      label:           entry.label,
      description:     entry.description,
      sensitive:       entry.sensitive,
      editable:        entry.editable,
      requiresRestart: entry.requiresRestart,
      source:          dbVal ? "database" : (envVal ? "environment" : "unset"),
      masked:          maskValue(current, entry.sensitive),
      isSet:           Boolean(current),
    };
  });

  res.json(result);
});

// ── PUT /api/admin/env-vars/:key — save an env var override to DB ─────────────
router.put("/env-vars/:key", requireSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const { key } = req.params as { key: string };
  const entry = ENV_CATALOG.find((e) => e.key === key);

  if (!entry) { res.status(404).json({ error: "Unknown environment variable" }); return; }
  if (!entry.editable) { res.status(403).json({ error: "This variable cannot be edited here" }); return; }

  const { value } = req.body as { value?: string };
  if (value === undefined || value === null) { res.status(400).json({ error: "value is required" }); return; }

  const trimmed = value.trim();
  const dbKey = `env:${key}`;

  if (trimmed === "") {
    // Empty string = remove the DB override (fall back to real env var)
    await db.delete(appSettingsTable).where(eq(appSettingsTable.key, dbKey));
  } else {
    await db
      .insert(appSettingsTable)
      .values({ key: dbKey, value: trimmed, updatedBy: req.userProfileId as any })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: trimmed, updatedAt: new Date(), updatedBy: req.userProfileId as any } });
    // Apply immediately where possible
    if (key === "LOG_LEVEL") process.env.LOG_LEVEL = trimmed;
  }

  void log({ event: "env_var_updated", userId: req.userId, message: `Env var ${key} updated via settings UI`, meta: { key } });
  res.json({ ok: true });
});

// ── GET /api/admin/logs — activity logs [super_admin] ────────────────────────
router.get("/logs", requireSuperAdmin, async (req: AuthedRequest, res: Response) => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? "200", 10), 500);
  const offset = parseInt((req.query.offset as string) ?? "0", 10);
  const event = req.query.event as string | undefined;

  const query = db.select().from(activityLogsTable);
  const rows = await (event
    ? query.where(eq(activityLogsTable.event, event))
    : query
  )
    .orderBy(desc(activityLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(rows);
});

// ── GET /api/admin/webodm-balance — NodeODM server info + balance ─────────────
router.get("/webodm-balance", requireSuperAdmin, async (_req: AuthedRequest, res: Response) => {
  const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "webodm_token"));
  const tokenVal = rows[0]?.value ?? process.env.WEBODM_LIGHTNING_TOKEN ?? "";
  if (!tokenVal) {
    res.status(400).json({ error: "No WebODM token configured" });
    return;
  }
  try {
    // NodeODM info endpoint
    const infoRes = await fetch(`https://spark1.webodm.net/info?token=${encodeURIComponent(tokenVal)}`, { signal: AbortSignal.timeout(8000) });
    if (!infoRes.ok) {
      res.status(502).json({ error: `NodeODM returned ${infoRes.status}` });
      return;
    }
    const info = await infoRes.json();

    // Also try to get task queue stats
    let queueStats = null;
    try {
      const queueRes = await fetch(`https://spark1.webodm.net/task/list?token=${encodeURIComponent(tokenVal)}`, { signal: AbortSignal.timeout(5000) });
      if (queueRes.ok) queueStats = await queueRes.json();
    } catch { /* best-effort */ }

    res.json({ info, queueStats, dashboardUrl: "https://webodm.net/dashboard" });
  } catch (err: any) {
    res.status(502).json({ error: "Failed to reach NodeODM server", details: String(err?.message ?? err) });
  }
});

// ── Helper ───────────────────────────────────────────────────────────────────
function rowToProfile(row: typeof userProfilesTable.$inferSelect) {
  return {
    id: row.id,
    clerkUserId: row.clerkUserId ?? null,
    username: row.username ?? null,
    email: row.email ?? null,
    displayName: row.displayName ?? null,
    role: row.role,
    status: row.status,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export default router;
