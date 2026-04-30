import { Router, type Request, type Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { eq, and, isNull } from "drizzle-orm";
import { db, userProfilesTable } from "@workspace/db";
import { signLocalJwt } from "../lib/roleAuth";
import { log } from "../lib/activityLog";

const router: Router = Router();

/**
 * Best-effort public origin detection.
 * Priority: REPLIT_DOMAINS env var (most reliable in Replit) →
 *           x-forwarded-host header → host header.
 * Always returns https:// for known public domains.
 */
function derivePublicOrigin(req: Request): string {
  // 1. REPLIT_DOMAINS is set by the platform and is always the real public host.
  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitDomain) return `https://${replitDomain}`;

  // 2. x-forwarded-proto + x-forwarded-host (standard reverse-proxy headers)
  const fwdProto = (req.headers["x-forwarded-proto"] as string | undefined)
    ?.split(",")[0]?.trim();
  const fwdHost = (req.headers["x-forwarded-host"] as string | undefined)
    ?.split(",")[0]?.trim();
  if (fwdProto && fwdHost) return `${fwdProto}://${fwdHost}`;

  // 3. FRONTEND_URL env var (explicit override)
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/$/, "");

  // 4. Fallback: local host with detected protocol
  const proto = fwdProto ?? req.protocol ?? "http";
  const host = req.headers.host ?? "localhost";
  return `${proto}://${host}`;
}

function getOAuthClient(req: Request): OAuth2Client {
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    `${derivePublicOrigin(req)}/api/auth/google/callback`;
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
}

function getFrontendBase(req: Request): string {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/$/, "");
  return derivePublicOrigin(req);
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local
    .split(/[.\-_+]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// GET /api/auth/google — redirect to Google consent page
router.get("/google", (req: Request, res: Response) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    res.status(503).json({ error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." });
    return;
  }
  const client = getOAuthClient(req);
  const detectedUri = process.env.GOOGLE_REDIRECT_URI ?? `${derivePublicOrigin(req)}/api/auth/google/callback`;
  req.log.info({ redirectUri: detectedUri }, "Google OAuth redirect_uri");
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
  });
  res.redirect(url);
});

// GET /api/auth/google/callback — exchange code, issue JWT, redirect frontend
router.get("/google/callback", async (req: Request, res: Response) => {
  const { code, error: oauthError } = req.query as { code?: string; error?: string };
  const frontendBase = getFrontendBase(req);

  if (oauthError || !code) {
    res.redirect(`${frontendBase}/sign-in?error=google_denied`);
    return;
  }

  try {
    const client = getOAuthClient(req);
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    if (!tokens.id_token) {
      res.redirect(`${frontendBase}/sign-in?error=no_id_token`);
      return;
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const googlePayload = ticket.getPayload();
    if (!googlePayload) {
      res.redirect(`${frontendBase}/sign-in?error=invalid_token`);
      return;
    }

    const googleId = googlePayload.sub;
    const email = googlePayload.email ?? "";
    const name = googlePayload.name ?? (email ? nameFromEmail(email) : "");

    // 1. Look up profile by googleId (stored in clerkUserId column)
    let [profile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.clerkUserId, googleId))
      .limit(1);

    // 2. Match by email if no googleId match
    if (!profile && email) {
      const [byEmail] = await db
        .select()
        .from(userProfilesTable)
        .where(
          and(eq(userProfilesTable.email, email), isNull(userProfilesTable.clerkUserId)),
        )
        .limit(1);

      if (byEmail) {
        const betterName =
          !byEmail.displayName || byEmail.displayName === email
            ? name || byEmail.displayName
            : byEmail.displayName;
        const [linked] = await db
          .update(userProfilesTable)
          .set({ clerkUserId: googleId, displayName: betterName ?? null, updatedAt: new Date() })
          .where(eq(userProfilesTable.id, byEmail.id))
          .returning();
        profile = linked;
      }
    }

    // 3. Create new pending profile
    if (!profile) {
      const [created] = await db
        .insert(userProfilesTable)
        .values({
          clerkUserId: googleId,
          email,
          displayName: name,
          role: "user",
          status: "pending",
        })
        .returning();
      profile = created;
    }

    const token = signLocalJwt(profile.id);

    void log({
      event: "login",
      userId: googleId,
      userEmail: email,
      message: `Google OAuth login: ${email}`,
    });

    const basePath = process.env.BASE_PATH?.replace(/\/$/, "") ?? "";
    res.redirect(`${frontendBase}${basePath}/auth/callback?token=${encodeURIComponent(token)}`);
  } catch (err) {
    req.log?.error({ err }, "Google OAuth callback error");
    const frontendBase = getFrontendBase(req);
    res.redirect(`${frontendBase}/sign-in?error=oauth_failed`);
  }
});

// POST /api/auth/logout — clears cookie (JWT is stateless; client drops localStorage token)
router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("adminToken");
  res.json({ success: true });
});

export default router;
