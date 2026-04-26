import { type Request, type Response, type NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { eq, or, isNull, and } from "drizzle-orm";
import { db, userProfilesTable } from "@workspace/db";
import type { UserRole, UserStatus } from "@workspace/db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET ?? "pilemetric-local-secret";

/**
 * Derive a human-readable display name from an email address when no Clerk
 * firstName/lastName is available.
 * e.g.  john.doe@company.com  →  "John Doe"
 *       sarah_smith@org.net   →  "Sarah Smith"
 *       mike123@mail.com      →  "Mike123"
 */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local
    .split(/[.\-_+]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export interface AuthedRequest extends Request {
  userId?: string;           // Clerk user ID or local username
  userProfileId?: string;    // user_profiles.id (uuid)
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
 * Combined auth middleware:
 * 1. Checks for a local-admin JWT in Authorization header (Bearer) or cookie.
 * 2. Falls back to Clerk session.
 * 3. Looks up user_profiles for role + status.
 * 4. Auto-creates a pending profile for first-time Clerk users.
 */
export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  // ── 1. Local JWT ────────────────────────────────────────────────────────
  const authHeader = req.headers.authorization ?? "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cookieToken = (req as any).cookies?.adminToken as string | undefined;
  const localToken = bearerToken || cookieToken || null;

  if (localToken) {
    const payload = verifyLocalJwt(localToken);
    if (payload) {
      const [profile] = await db
        .select()
        .from(userProfilesTable)
        .where(eq(userProfilesTable.id, payload.profileId))
        .limit(1);
      if (profile && profile.status === "approved") {
        req.userProfileId = profile.id;
        req.userId = profile.username ?? profile.clerkUserId ?? profile.id;
        req.userRole = profile.role as UserRole;
        req.userStatus = profile.status as UserStatus;
        req.isLocalAdmin = true;
        next();
        return;
      }
    }
  }

  // ── 2. Clerk JWT ─────────────────────────────────────────────────────────
  const auth = getAuth(req);
  const clerkId = (auth?.sessionClaims as { userId?: string } | undefined)?.userId || auth?.userId;
  if (!clerkId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // ── 3. Look up or create profile ─────────────────────────────────────────
  let [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkUserId, clerkId))
    .limit(1);

  if (!profile) {
    // Fetch the user's email from Clerk to match a pre-created profile
    let email = (auth?.sessionClaims?.email as string | undefined) ?? "";
    let name = (auth?.sessionClaims?.name as string | undefined) ?? "";
    try {
      const clerkUser = await clerkClient().users.getUser(clerkId);
      email = clerkUser.emailAddresses?.[0]?.emailAddress ?? email;
      const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim();
      name = fullName || nameFromEmail(email) || email;
    } catch {
      // silently fall back to session claims
      if (!name && email) name = nameFromEmail(email) || email;
    }

    // Check if a pre-created profile exists for this email (no clerkUserId yet)
    if (email) {
      const [existing] = await db
        .select()
        .from(userProfilesTable)
        .where(
          and(
            eq(userProfilesTable.email, email),
            isNull(userProfilesTable.clerkUserId),
          ),
        )
        .limit(1);

      if (existing) {
        // Link the Clerk ID to the pre-created profile.
        // If the existing displayName is blank or was set to the raw email
        // (old behaviour), replace it with the better derived name.
        const betterName = (!existing.displayName || existing.displayName === email)
          ? (name || existing.displayName)
          : existing.displayName;
        const [linked] = await db
          .update(userProfilesTable)
          .set({ clerkUserId: clerkId, displayName: betterName, updatedAt: new Date() })
          .where(eq(userProfilesTable.id, existing.id))
          .returning();
        profile = linked;
      }
    }

    if (!profile) {
      // No pre-created profile — create a new pending one
      const [created] = await db
        .insert(userProfilesTable)
        .values({
          clerkUserId: clerkId,
          email,
          displayName: name || email,
          role: "user",
          status: "pending",
        })
        .returning();
      profile = created;
    }
  }

  req.userId = clerkId;
  req.userProfileId = profile.id;
  req.userRole = profile.role as UserRole;
  req.userStatus = profile.status as UserStatus;
  req.isLocalAdmin = false;
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
