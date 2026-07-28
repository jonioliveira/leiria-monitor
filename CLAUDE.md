# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Rede Sentinela** (`redesentinela.com`) — a PWA that monitors infrastructure recovery in the Leiria district of Portugal after storm Kristin (28 Jan 2026). It aggregates official open data (E-REDES, IPMA, ANEPC/ProCiv, ANACOM, Copernicus EMS), scrapes telecom operator status pages, and collects citizen reports with GPS + photo.

All user-facing copy is **European Portuguese**. There is no i18n framework — strings are inline. Keep new UI text in pt-PT.

## Commands

```bash
pnpm install                     # pnpm only (package-lock.json is gitignored)
pnpm dev                         # next dev (Turbopack)
pnpm build                       # production build — required to exercise the service worker
pnpm start

docker compose up -d             # local Postgres 17 on port 5436
pnpm db:push                     # drizzle-kit push — applies src/db/schema.ts directly
pnpm db:studio

node scripts/generate-icons.mjs  # regenerate PWA icons from public/icon-512.png
```

- **No test suite exists.** There are no test files, no test runner, and no CI config. Verify changes by running the app.
- `pnpm lint` maps to `next lint`, but no ESLint config is checked in. For a real check use `npx tsc --noEmit`.
- Drizzle is **push-only** — there is no `drizzle/` migrations directory. Schema changes go in `src/db/schema.ts` followed by `pnpm db:push`.

### Triggering cron routes locally

Every `/api/cron/*` route is gated by `verifyCronSecret` (`src/lib/cron-auth.ts`):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/ingest-all
```

## Environment

`DATABASE_URL`, `CRON_SECRET`, `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`, `FEATURE_AI_PRIORITY` (`"true"` enables Claude Haiku priority classification), `ANTHROPIC_API_KEY` (read implicitly by the SDK).

## Architecture

### Data flow

```
external sources ──▶ /api/cron/*  ──write──▶ Postgres ──read──▶ /api/*  ──fetch──▶ client pages
                          ▲                                                  ▲
                   Vercel Cron (vercel.json)                    all pages are "use client"
```

Pages never query the database. Every page is a client component that `fetch`es `/api/...` and polls on an interval. Public API routes should never make slow external calls on the request path — that is the crons' job.

### Three ingestion patterns — pick the one that matches

1. **Replace-all relational tables** — `/api/cron/ingest-all` (IPMA warnings/forecasts, E-REDES scheduled work, ProCiv occurrences + population warnings, antennas). Deletes the table then bulk-inserts. Each source is wrapped in its own try/catch and reports into a `results` map so one failing source never fails the whole run. Individual crons (`/api/cron/ipma`, `/prociv`, `/eredes`, `/antennas`) duplicate slices of this for manual re-runs.

2. **JSONB single-row cache + stale-while-revalidate** — `telecom_cache`, `substation_cache`, `transformer_cache`. The expensive fetch lives in a `src/lib/*-fetcher.ts` module shared by **both** the cron route and the public route. The public route reads the newest cache row, returns it immediately, and when older than `STALE_AFTER_MS` schedules `after(refreshCache)` so the refresh runs post-response. Cold start (no row) fetches synchronously. See `src/app/api/telecom/route.ts` as the canonical example.

3. **Direct passthrough** — a few routes (`/api/dashboard` substation counts) hit the E-REDES OpenDataSoft API inline with `AbortSignal.timeout` and `.catch(() => fallback)`, relying on `export const revalidate` for caching.

When adding a new external source, put the fetch/parse logic in `src/lib/<thing>-fetcher.ts` — never inline it in a route that a browser hits.

### Database (`src/db/`)

`src/db/index.ts` exports `db` as a **Proxy** that lazily builds the client on first property access, choosing `drizzle-orm/neon-http` for Neon URLs and `drizzle-orm/node-postgres` otherwise. This keeps `DATABASE_URL` from being required at module-eval time (important for build). Import `db` freely; it only connects when used.

Table groups in `schema.ts`: ingested official data (`ipma_*`, `prociv_*`, `eredes_*`), the three `*_cache` JSONB tables, geo reference data (`antennas`, `bt_poles`), and the citizen-facing `user_reports` + `push_subscriptions`.

### Geography

`src/lib/parish-lookup.ts` does point-in-polygon (`@turf/boolean-point-in-polygon`) against a bundled GeoJSON of Leiria freguesias, lazily `require`d. Reports store the **parish name string** (`Freguesia`); concelho is derived by building a parish→concelho map from the same GeoJSON (see `/api/dashboard`). Council pages route by slug — `src/lib/slug-utils.ts` builds the slug map from `MUNICIPALITY_COORDS` in `src/lib/constants.ts`.

`src/lib/constants.ts` is the single home for municipality/substation coordinates, E-REDES dataset ids, IPMA URLs and awareness-code mappings. Add new hardcoded geo/source data there.

### Reports pipeline

`POST /api/reports` → validate → `resolveParish(lat,lng)` → `classifyPriority()` → insert → `after()` fires `sendPushToNearby()`.

- `classify-priority.ts`: keyword matcher by default; behind `FEATURE_AI_PRIORITY=true` it calls Claude Haiku and **falls back to keywords** on any error or unexpected output.
- `push.ts`: only `"urgente"` reports notify. Targets are subscriptions within 15 km (haversine filtered in JS — no PostGIS) plus subscriptions with null coordinates. HTTP 404/410 responses prune dead subscriptions.
- `hotspot-detection.ts`: greedy 500 m / ≥3 reports / 24 h clustering, computed on read in `GET /api/reports`.
- Photos go to Cloudflare R2 via the S3 SDK (`/api/reports/upload`), 5 MB cap, JPEG/PNG/WebP only.

### PWA (Serwist)

`src/sw.ts` is compiled by `@serwist/next` to `public/sw.js` and is **disabled outside production** — service worker behaviour only appears after `pnpm build && pnpm start`. It is excluded from `tsconfig.json` and typed via `tsconfig.sw.json`.

Offline report submission has two paths: Background Sync (`BackgroundSyncPlugin`, Android/Chrome) and a localStorage queue in `src/lib/report-queue.ts` flushed by `OfflineBanner` on reconnect (iOS/Safari fallback). Both must keep working — don't collapse them.

Runtime caching: map tiles and static assets cache-first, all `/api/*` GETs network-first with a 5 s timeout, navigation failures fall back to `/offline`.

### Map

`src/components/unified-map.tsx` is the single Leaflet component (~1200 lines) and the **source of truth for shared marker types** (`Report`, `Hotspot`, `TransformerMarker`, `AntennaFeature`, `PoleMarker`) which `src/app/map/page.tsx` imports back. It is loaded via `next/dynamic` with `ssr: false` — Leaflet touches `window` at import time, so never import it statically.

Heavy layers (transformers, antennas, poles) load lazily on toggle. Poles are queried by viewport bbox (`/api/electricity/poles?minLat=...`) capped at 10 000 rows.

### Styling

Tailwind v4 CSS-first: theme lives in `src/app/globals.css` as oklch CSS variables under `:root`. A legacy `tailwind.config.js` also exists supplying the `storm-*` palette and the DM Sans / JetBrains Mono families — both are live, so check both before adding tokens. shadcn/ui `new-york`, components in `src/components/ui/`, dark-only design (no light theme is defined).

## Conventions

- `@/*` → `src/*`.
- Conventional commits with a scope: `feat(pwa):`, `fix(ui):`, `perf(api):`, `feat(db):`.
- API responses are `{ success: true, timestamp, ...data }`; errors are `{ success: false, error }` with the status. Routes assembling composite dashboards degrade gracefully (`Promise.allSettled`, `.catch(() => fallback)`) rather than 500-ing on one bad upstream.
- Cron routes declare `export const maxDuration`; read routes declare `export const revalidate`.

## Notes

- `vercel.json` only registers four crons (`ingest-all` daily, `telecom` 15 min, `substations` 6 h, `transformers` daily). Other `/api/cron/*` routes — notably `poles` (`maxDuration = 300`) — are manual/one-off backfills. `CRON_INTERVALS` in `constants.ts` is documentation, not wiring; `vercel.json` is authoritative.
- `docs/roadmap.md` describes the intended direction (PWA → Go API on k3s → Expo app). Phase 1 (PWA) is what has been built.
- `.claude/agents/*.md` were copied from an unrelated project ("Bookletic", Prisma + NextAuth + next-intl) and do not describe this codebase. Ignore them.
- `CLAUDE.md` is listed in `.gitignore`, so this file stays local unless that entry is removed.
