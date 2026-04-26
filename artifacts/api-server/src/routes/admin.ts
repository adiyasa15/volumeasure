import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, ne, or, inArray, not } from "drizzle-orm";
import { db, userProfilesTable } from "@workspace/db";
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

const router: IRouter = Router();

// ── POST /api/admin/auth/login — local username/password login ──────────────
router.post("/auth/login", async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: "username and password required" });
    return;
  }
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.username, username))
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
