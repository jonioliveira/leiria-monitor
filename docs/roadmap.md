# Rede Sentinela — Platform Roadmap

**Project:** Rede Sentinela (redesentinela.com)
**Purpose:** Outage reporting and recovery monitoring for the Leiria district after Storm Kristin
**Document type:** Engineering project plan
**Revision:** 1.0 — 2026-02-27

---

## Current State

| Layer | Technology | Hosting |
|---|---|---|
| Frontend + API | Next.js 16 App Router | Vercel |
| Database | PostgreSQL (Neon serverless) | Neon |
| Cron jobs | Vercel Cron | Vercel |
| Infrastructure | — | — |

**What exists today:**
- Citizen report submission with GPS + photo
- Live map with reports, transformers, antennas, BT poles
- Council and parish dashboards
- Situation page (weather, fires, telecoms, electricity)
- Recovery score tracking
- Telecom scraping (MEO, NOS, Vodafone)
- E-REDES substation + transformer monitoring
- `manifest.webmanifest` already in place (partial PWA foundation)

---

## Strategic Direction

```
Phase 1 — PWA          Enhance the existing web app to be installable
Phase 2 — Go API       Move backend to Go on k3s, decouple from Vercel
Phase 3 — Expo App     Native iOS + Android app for citizens
```

**Dependency order:** Phase 1 is independent. Phase 3 depends on Phase 2 being stable (Expo app should target the Go API, not the Next.js routes).

---

## Phase 1 — Progressive Web App

**Goal:** Citizens can install Rede Sentinela on their phone's home screen, use it offline, and receive push notifications for critical alerts.

**Hosting:** Stays on Vercel. No infrastructure changes.

### Epics

#### 1.1 — Installability
Make the app pass all browser install criteria.

| Task | Description | Size |
|---|---|---|
| Audit manifest | Verify icons (all sizes), `display`, `start_url`, `theme_color`, `background_color` | S |
| Icon set | Generate all required sizes (72, 96, 128, 144, 152, 192, 384, 512px) + maskable variant | S |
| iOS meta tags | Add `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` to `<head>` | S |
| Install prompt | Capture `beforeinstallprompt` event, show custom "Instalar app" banner on map page | M |
| Splash screens | iOS requires static splash screen images per device size | M |

**Acceptance criteria:** Chrome/Safari on iOS and Android shows install option. App opens in standalone mode (no browser chrome).

---

#### 1.2 — Service Worker + Offline
Cache critical assets and allow map/report browsing when offline.

| Task | Description | Size |
|---|---|---|
| Service worker setup | Add `sw.ts` (or use Workbox via `next-pwa`) with cache-first for static assets | M |
| App shell caching | Cache the map page shell so it loads instantly | M |
| API response caching | Cache last known `/api/reports`, `/api/dashboard` responses for offline display | M |
| Offline fallback | Show "Sem ligação — a mostrar dados guardados" banner when serving cached data | S |
| Background sync | Queue report submissions made offline and replay when connectivity returns | L |

**Acceptance criteria:** App loads with cached data when airplane mode is on. Offline report queued and submitted automatically on reconnect.

> **Note on background sync:** iOS Safari does not support Background Sync API. Queue should persist in `localStorage` and flush on next foreground open as a fallback.

---

#### 1.3 — Push Notifications
Alert citizens to critical events (new urgente reports nearby, major outages).

| Task | Description | Size |
|---|---|---|
| VAPID key generation | Generate public/private VAPID key pair, store private key in env | S |
| Subscription endpoint | `POST /api/push/subscribe` — stores `PushSubscription` in new `push_subscriptions` DB table | M |
| DB schema | Add `push_subscriptions` table (`endpoint`, `p256dh`, `auth`, `lat`, `lng`, `created_at`) | S |
| Notification trigger | Send push when a report with priority `urgente` is submitted (from `/api/reports` POST handler) | M |
| Geo-filtering | Only notify subscribers within ~20km radius of the new report | M |
| Permission prompt UI | Add "Ativar notificações" button in settings/map page with permission request flow | S |
| iOS 16.4+ testing | Verify Web Push works on iOS 16.4+ (requires installed PWA, not browser) | M |

**Acceptance criteria:** Submitting an `urgente` report sends a push notification to nearby subscribed users within 30 seconds. Notification taps open the map centred on the report.

---

#### 1.4 — Mobile UX Polish
Ensure the existing UI is production-quality on mobile.

| Task | Description | Size |
|---|---|---|
| Viewport + safe areas | Add `env(safe-area-inset-*)` padding for notch/home indicator devices | S |
| Touch targets | Audit all interactive elements for minimum 44×44px touch target | S |
| Report form — camera | Ensure photo capture uses `accept="image/*" capture="environment"` for direct camera access on mobile | S |
| Performance audit | Lighthouse PWA + Performance audit on mobile, fix any blocking issues | M |

---

### Phase 1 — Definition of Done
- [ ] Lighthouse PWA score ≥ 90
- [ ] Installs on iOS 16.4+ and Android 10+
- [ ] Loads cached content offline
- [ ] Offline report submission queues and retries
- [ ] Push notifications delivered on iOS and Android

---

## Phase 2 — Go API on k3s

**Goal:** Replace all Next.js API routes with a Go HTTP service running on the existing k3s cluster. Eliminate Vercel serverless function costs, gain persistent DB connection pooling, full Go web server patterns, and move crons to k8s CronJobs.

**Architecture after migration:**
```
redesentinela.com        → Vercel  (Next.js PWA — frontend only, zero API routes)
api.redesentinela.com    → k3s     (Go HTTP server, chi router)
neondb (Neon)            → Neon    (PostgreSQL — unchanged)
```

### Epics

#### 2.1 — Go Project Setup

| Task | Description | Size |
|---|---|---|
| Repository structure | Create `api/` directory (or separate repo) with Go module, `cmd/api/main.go`, `internal/` layout | S |
| Dependencies | `chi` (router), `pgx/v5` (postgres driver), `sqlc` (query gen), `goose` (migrations), `zap` (logging) | S |
| Config | Env-based config struct (`DATABASE_URL`, `CRON_SECRET`, `PORT`, `CORS_ORIGIN`, etc.) | S |
| Linting + formatting | `golangci-lint` config, `gofmt`, CI check | S |
| Health endpoint | `GET /healthz` → `{"status":"ok"}` | S |

---

#### 2.2 — Database Layer

| Task | Description | Size |
|---|---|---|
| SQL migrations | Port Drizzle schema to `.sql` migration files managed by goose | M |
| sqlc setup | `sqlc.yaml` pointing at migrations + queries directory | S |
| Write queries | Port all Drizzle queries to `.sql` files, generate Go types via `sqlc generate` | L |
| Connection pool | Configure `pgxpool` with sensible min/max connections for k3s pod count | S |

> **Decision:** Keep using Neon (serverless Postgres). `pgxpool` works fine with Neon's connection pooler endpoint. No need to run Postgres in k3s.

---

#### 2.3 — Port API Handlers

One Go handler file per domain, using chi sub-routers.

| Endpoint group | Current Next.js route | Go handler | Size |
|---|---|---|---|
| Reports | `/api/reports` | `internal/handlers/reports.go` | M |
| Dashboard | `/api/dashboard` | `internal/handlers/dashboard.go` | M |
| Weather | `/api/weather` | `internal/handlers/weather.go` | S |
| Electricity outages | `/api/electricity` | `internal/handlers/electricity.go` | M |
| Substations | `/api/electricity/substations` | `internal/handlers/substations.go` | S |
| Transformers | `/api/electricity/transformers` | `internal/handlers/transformers.go` | S |
| Poles | `/api/electricity/poles` | `internal/handlers/poles.go` | S |
| Telecom | `/api/telecom` | `internal/handlers/telecom.go` | S |
| Antennas | `/api/antennas` | `internal/handlers/antennas.go` | S |
| Occurrences | `/api/occurrences` | `internal/handlers/occurrences.go` | S |
| Copernicus | `/api/copernicus` | `internal/handlers/copernicus.go` | S |
| Push subscribe | `/api/push/subscribe` | `internal/handlers/push.go` | M |
| Priority classify | (internal, called from reports) | `internal/classify/priority.go` | M |

---

#### 2.4 — Port Scrapers

| Scraper | Source | Size |
|---|---|---|
| E-REDES outages | OpenDataSoft API | M |
| E-REDES substations | OpenDataSoft API + pagination | M |
| E-REDES transformers | OpenDataSoft API + pagination | M |
| E-REDES scheduled work | OpenDataSoft API | M |
| MEO availability | SearchStores REST API | M |
| NOS availability | Forum page HTML scraping | L |
| Vodafone availability | Help page HTML scraping | L |
| IPMA warnings | IPMA REST API | S |
| IPMA forecasts | IPMA REST API | S |
| ProCiv occurrences | ProCiv API | S |
| ProCiv warnings | ProCiv page scraping | M |
| Antennas ingest | ANACOM data | M |
| Copernicus | Copernicus API | S |

> **Note:** HTML scrapers (NOS, Vodafone, ProCiv) are fragile by nature. Port them with the same regex approach currently in TypeScript. Add structured error logging so scraper failures are visible.

---

#### 2.5 — Cron Jobs

Replace Vercel Cron with k8s `CronJob` resources. Each cron calls the Go API's internal cron handler (authenticated via `CRON_SECRET` header, same pattern as today).

| Job | Schedule | k8s manifest |
|---|---|---|
| `ingest-all` | `0 0 * * *` | `k8s/cronjobs/ingest-all.yaml` |
| `telecom` | `*/15 * * * *` | `k8s/cronjobs/telecom.yaml` |
| `substations` | `0 */6 * * *` | `k8s/cronjobs/substations.yaml` |
| `transformers` | `0 3 * * *` | `k8s/cronjobs/transformers.yaml` |
| `recovery-snapshot` | `0 1 * * *` | `k8s/cronjobs/snapshot.yaml` |

CronJob pods use `curl` to call `http://api-service/api/cron/<name>` inside the cluster. No public exposure needed.

---

#### 2.6 — k8s Manifests

| Manifest | Description | Size |
|---|---|---|
| `Dockerfile` | Multi-stage build: `golang:1.23-alpine` builder → `scratch` final image (~12MB) | S |
| `k8s/deployment.yaml` | 2 replicas, resource limits, liveness/readiness probes on `/healthz` | S |
| `k8s/service.yaml` | ClusterIP service exposing port 8080 | S |
| `k8s/ingress.yaml` | Traefik IngressRoute for `api.redesentinela.com` with TLS | S |
| `k8s/secret.yaml` | Template for `DATABASE_URL`, `CRON_SECRET`, etc. (actual values in 1Password/sealed secrets) | S |
| `k8s/hpa.yaml` | HorizontalPodAutoscaler (2–5 replicas based on CPU) | S |

---

#### 2.7 — CI/CD

| Task | Description | Size |
|---|---|---|
| GitHub Actions workflow | On push to `main`: `go test`, `golangci-lint`, `docker build`, push to registry | M |
| Registry | Use GitHub Container Registry (ghcr.io) or self-hosted registry on k3s | S |
| Deploy step | `kubectl set image deployment/api api=ghcr.io/...:<sha>` or `kubectl rollout restart` | S |
| Rollback | Document rollback procedure (`kubectl rollout undo`) | S |

---

#### 2.8 — Cutover Strategy

Zero-downtime migration from Next.js API routes to Go API.

| Step | Action |
|---|---|
| 1 | Deploy Go API to k3s, verify all endpoints return correct responses |
| 2 | Add `NEXT_PUBLIC_API_BASE` env var to Next.js pointing at `api.redesentinela.com` |
| 3 | Update all `fetch("/api/...")` calls in the frontend to use `NEXT_PUBLIC_API_BASE` |
| 4 | Deploy to Vercel preview URL, run smoke tests |
| 5 | Promote to production — both APIs running in parallel |
| 6 | Monitor for 24–48h, verify no errors |
| 7 | Remove all `src/app/api/` Next.js route handlers |

> **CORS:** Go API must allow `https://redesentinela.com` and `http://localhost:3000` origins.

---

### Phase 2 — Definition of Done
- [ ] All existing API endpoints replicated in Go with identical response shapes
- [ ] All scrapers ported and verified against live data
- [ ] k8s CronJobs replacing Vercel Cron (verified via logs)
- [ ] `/healthz` liveness probe passing, 2 replicas running
- [ ] Next.js `src/app/api/` directory deleted
- [ ] No Vercel function invocations for API traffic

---

## Phase 3 — Expo React Native App

**Goal:** Native iOS and Android app published to App Store and Google Play. Focused on the two highest-value mobile flows: submitting a geo-located report with a photo, and viewing the live map.

**Backend:** Targets the Go API from Phase 2 (`api.redesentinela.com`). Do not start Phase 3 until Phase 2 is stable.

**Stack:** Expo SDK (managed workflow), Expo Router (file-based navigation), TypeScript.

### Epics

#### 3.1 — Project Setup

| Task | Description | Size |
|---|---|---|
| Expo init | `npx create-expo-app` with TypeScript template, Expo Router | S |
| Repository | Monorepo subfolder `mobile/` or separate repo | S |
| API client | Typed fetch client pointing at `api.redesentinela.com`, shared `types.ts` with the web app | M |
| Environment config | `app.config.ts` with `API_BASE_URL` per environment (dev/prod) | S |
| EAS setup | Configure Expo Application Services for builds and OTA updates | M |

---

#### 3.2 — Core Screens

| Screen | Description | Size |
|---|---|---|
| Map | `react-native-maps` with report markers, cluster grouping, tap-to-report | L |
| Report form | Two-step flow matching the web form: category → subcategory → details | L |
| GPS capture | Auto-fill coordinates from device GPS, show pin on mini-map preview | M |
| Camera / photo | `expo-image-picker` for photo capture or gallery pick | M |
| Report detail sheet | Bottom sheet showing report details on marker tap | M |
| Situation | Cards for electricity, telecoms, water, roads — read from `/api/dashboard` | M |
| Notifications | In-app notification centre (list of recent critical alerts) | M |

---

#### 3.3 — Push Notifications

| Task | Description | Size |
|---|---|---|
| Expo Notifications setup | `expo-notifications`, request permission on first launch | S |
| Token registration | Send Expo Push Token to `POST /api/push/subscribe` on the Go API | M |
| Go API update | Add Expo Push Token handling alongside Web Push in the Go push handler | M |
| Notification handling | Deep-link to map centred on report when notification tapped | M |

> Expo's push service handles both APNs (iOS) and FCM (Android) from a single token — simpler than managing raw APNs/FCM directly.

---

#### 3.4 — Offline Support

| Task | Description | Size |
|---|---|---|
| React Query / TanStack | Cache API responses with `staleTime`, serve from cache when offline | M |
| Offline report queue | Store unsent reports in `expo-secure-store` or SQLite, flush on reconnect | M |
| Connectivity indicator | Banner when device is offline, indicating cached data age | S |

---

#### 3.5 — App Store Release

| Task | Description | Size |
|---|---|---|
| App icons | 1024×1024 source icon, Expo generates all required sizes | S |
| Splash screen | Branded splash with `expo-splash-screen` | S |
| App Store listing | Screenshots (6.5" iPhone, 12.9" iPad), description in Portuguese | M |
| Google Play listing | Feature graphic, screenshots, description | M |
| Apple Developer account | Enroll if not already (€99/year) | S |
| TestFlight beta | Internal testing with EAS build + TestFlight distribution | M |
| Play Store internal track | Upload AAB via EAS, share internal testing link | M |
| Privacy policy | Required by both stores — data collected: location, photos, device token | M |
| Public release | Submit for review on both stores | M |

---

### Phase 3 — Definition of Done
- [ ] App published on App Store (iOS 16+)
- [ ] App published on Google Play (Android 10+)
- [ ] Citizens can submit geo-located reports with photos
- [ ] Map shows live reports from the Go API
- [ ] Push notifications received on both platforms
- [ ] Offline report queuing works without connectivity

---

## Cross-Phase Dependencies

```
Phase 1 ──────────────────────────────────────────► Done (independent)

Phase 2 ──────────────────────────────────────────► Done
                                                        │
Phase 3 ────────────────────────────────────────────────► Requires Phase 2 stable
```

Phase 1 and Phase 2 can run in parallel.
Phase 3 should only start once the Go API is verified stable in production.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| iOS Web Push limitations | Push notifications don't reach iOS < 16.4 | Document minimum iOS version, fallback to in-app alerts |
| Scraper breakage (NOS, Vodafone HTML) | Telecom data goes stale | Add scraper health monitoring, alert on consecutive failures |
| k3s cluster availability | Go API downtime = app broken | 2 replicas + HPA, readiness probes, runbook for restart |
| Neon cold starts on DB | Occasional slow first query | Use pooler endpoint, keep pool alive with periodic ping |
| App Store review rejection | Delay on Phase 3 launch | Prepare privacy policy + data usage description early, use TestFlight for beta period |
| NOS/Vodafone scraper port to Go | HTML parsing is fragile | Port with extensive test cases against saved HTML snapshots |

---

## Open Decisions

| Decision | Options | Recommendation |
|---|---|---|
| Secrets management in k3s | Sealed Secrets, External Secrets Operator, manual kubectl secrets | Sealed Secrets (GitOps-friendly) |
| Container registry | ghcr.io, Docker Hub, self-hosted | ghcr.io (free for public repos, integrated with GitHub Actions) |
| Go API repo | Monorepo with web app or separate | Separate repo (`leiria-monitor-api`) — different deploy cadence |
| Expo app repo | Monorepo or separate | Separate repo (`leiria-monitor-mobile`) |
| AI priority classification | Keep Claude API or port to rules-only | Keep Claude API — called from Go via HTTP, same as current TS implementation |
| DB for Phase 2 | Keep Neon or move to k3s Postgres | Keep Neon — zero ops, reliable, cost is minimal for this workload |
