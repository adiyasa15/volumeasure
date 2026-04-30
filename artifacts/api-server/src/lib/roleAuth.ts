import { type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, userProfilesTable } from "@workspace/db";
import type { UserRole, UserStatus } from "@workspace/db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET ?? "pilemetric-local-secret";

export interface AuthedRequest extends Request {
  userId?: string;           // Google sub, or local username, or profile ID
  userProfileId?: string;    // user_profiles.id (uuid)
  userEmail?: string;        // Email address of the acting user
  userDisplayName?: string;  // Human-readable name for log messages
  userRole?: UserRole;
  userStatus?: UserStatus;
  isLocalAdmin?: boolean;
}

/** Decode and verify our local JWT. Returns payload or null. */
export function verifyLocalJwt(token: string): { profileId: string } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { profileId: string };
    return payload;
  } catch {
    return null;
  }
}

/** Issue a local JWT for the superadmin session. */
export function signLocalJwt(profileId: string): string {
  return jwt.sign({ profileId }, JWT_SECRET, { expiresIn: "8h" });
}

/**
 * Auth middleware — verifies the JWT (issued by local login or Google OAuth callback).
 * All authenticated users carry the same JWT format: { profileId }.
 * Token is read from Authorization: Bearer header or adminToken cookie.
 */
export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cookieToken = (req as any).cookies?.adminToken as string | undefined;
  const token = bearerToken || cookieToken || null;

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = verifyLocalJwt(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.id, payload.profileId))
    .limit(1);

  if (!profile) {
    res.status(401).json({ error: "Profile not found" });
    return;
  }

  req.userProfileId = profile.id;
  req.userId = profile.clerkUserId ?? profile.username ?? profile.id;
  req.userEmail = profile.email ?? undefined;
  req.userDisplayName = profile.displayName ?? profile.username ?? profile.email ?? undefined;
  req.userRole = profile.role as UserRole;
  req.userStatus = profile.status as UserStatus;
  req.isLocalAdmin = Boolean(profile.passwordHash);
  next();
}

/** Middleware — reject if account is pending or suspended (allow approved only). */
export function requireApproved(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  if (req.userStatus !== "approved") {
    res.status(403).json({
      error: "account_not_approved",
      status: req.userStatus,
      message:
        req.userStatus === "pending"
          ? "Your account is awaiting admin approval."
          : "Your account has been suspended.",
    });
    return;
  }
  next();
}

/** Middleware — allow only super_admin. */
export function requireSuperAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  if (req.userRole !== "super_admin") {
    res.status(403).json({ error: "Forbidden — super_admin required" });
    return;
  }
  next();
}

/** Middleware — allow super_admin or admin. */
export function requireAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  if (req.userRole !== "super_admin" && req.userRole !== "admin") {
    res.status(403).json({ error: "Forbidden — admin required" });
    return;
  }
  next();
}

/** Middleware — allow super_admin, admin, or user (not readonly). */
export function requireUser(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  if (req.userRole === "readonly") {
    res.status(403).json({ error: "Forbidden — read-only account" });
    return;
  }
  next();
}

export function canManageRole(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === "super_admin") return true;
  if (actorRole === "admin") return targetRole === "user" || targetRole === "readonly";
  return false;
}

export function canSetRole(actorRole: UserRole, newRole: UserRole): boolean {
  if (actorRole === "super_admin") return true;
  if (actorRole === "admin") return newRole === "user" || newRole === "readonly";
  return false;
}
