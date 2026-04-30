# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## PileMetric (artifacts/stockpile)

AI Stockpile Volume Measurement web app. Operators upload drone/DSLR imagery; the
backend dispatches photogrammetry to WebODM Lightning (webodm.net) and reports
volume (m³) and area. Industrial dark-mode dashboard with Google OAuth 2.0 auth, Leaflet maps,
and client-side EXIF GPS + sharpness pre-filtering (`exifr`).

Backend (`artifacts/api-server`):
- Dual-auth REST under `/api`: local JWT (Bearer) for admin users, Google OAuth 2.0 JWT for regular users.
- Auth routes: `GET /api/auth/google` (initiates OAuth), `GET /api/auth/google/callback` (exchange code → JWT), `POST /api/auth/logout`.
- Auth middleware in `artifacts/api-server/src/lib/roleAuth.ts` — verifies JWT (signed with `SESSION_SECRET`), auto-creates pending profile for first-time Google users using their Google `sub` stored in `clerkUserId` column and their email.
- Roles: `super_admin`, `admin`, `user`, `readonly`. Statuses: `pending`, `approved`, `suspended`.
- New users via Google start as `pending`; an admin must approve them before they can access the app.
- Required env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Optional: `GOOGLE_REDIRECT_URI`, `FRONTEND_URL` (auto-detected from request if not set).
- Superadmin: username `superadmin`, local password, logs in at `/admin-login`. JWT issued for 8h.
- Admin endpoints: `POST /api/admin/auth/login`, `GET /api/admin/me`, `GET /api/admin/users`, `POST /api/admin/users`, `PATCH /api/admin/users/:id`, `DELETE /api/admin/users/:id`.
- Job visibility: super_admin → all jobs; admin → own + ordinary-user jobs; user/readonly → own only.
- WebODM Lightning client uses `Authorization: JWT $WEBODM_LIGHTNING_TOKEN`; status codes 10/20/40 → queued/running/completed; 30/50 → failed. When token is missing, the refresh route falls back to a deterministic demo progression so the UI stays functional.
- Drizzle schema: `lib/db/src/schema/jobs.ts` + `lib/db/src/schema/user_profiles.ts`.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
