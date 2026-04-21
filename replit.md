# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## PileMetric (artifacts/stockpile)

AI Stockpile Volume Measurement web app. Operators upload drone/DSLR imagery; the
backend dispatches photogrammetry to WebODM Lightning (webodm.net) and reports
volume (m³) and area. Industrial dark-mode dashboard with Clerk auth, Leaflet maps,
and client-side EXIF GPS + sharpness pre-filtering (`exifr`).

Backend (`artifacts/api-server`):
- Clerk-authenticated REST under `/api` (jobs CRUD, refresh, dashboard summary, recent activity).
- WebODM Lightning client uses `Authorization: JWT $WEBODM_LIGHTNING_TOKEN`; status codes 10/20/40 → queued/running/completed; 30/50 → failed. When token is missing, the refresh route falls back to a deterministic demo progression so the UI stays functional.
- Drizzle schema: `lib/db/src/schema/jobs.ts` (`jobs` table keyed by Clerk userId).

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
