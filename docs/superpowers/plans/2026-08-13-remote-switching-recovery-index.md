# Remote Switching Recovery Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/recovery`'s flatlined substation chart as the lead metric with a Remote Switching Recovery Index derived from E-REDES work orders, which still advance monthly.

**Architecture:** A cron ingests monthly `month × concelho` order counts from E-REDES into a `switching_orders` table. A pure function turns those rows into a percentage index against a pre-storm baseline. Two read surfaces consume it: `/api/electricity/switching` (district series + per-concelho) for `/recovery`, and `/api/dashboard/area` for council pages.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + Postgres (Neon in production), Recharts, TypeScript.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-08-13-remote-switching-recovery-index-design.md`.
- **All user-facing copy is European Portuguese.** No i18n framework; strings are inline.
- **`tipo_de_servico` values are double-encoded UTF-8 in the source data.** The API returns `InterrupÃ§Ãµes`, not `Interrupções`. The correct spelling matches zero rows **and returns no error**. These literals must be preserved exactly.
- **Never use `total_count` for pagination on `group_by` queries.** E-REDES caps it at the page size — it reports `100` for a 952-group result. Paginate until a page returns fewer rows than the page size.
- **Filter by `concelho in (...)`, never `distrito='Leiria'`.** Ourém is administratively Santarém; the district filter also pulls in Bombarral and Óbidos.
- `LEIRIA_MUNICIPALITIES` in `src/lib/constants.ts` is the authoritative 15-municipality list and already carries the correct `Castanheira de Pêra` spelling.
- The repository has **no test framework**. Verification uses standalone scripts run with `node --experimental-strip-types`, plus `tsc --noEmit` and a production build. Scripts live in the scratchpad and are **not** committed.
- Build verification must use `./node_modules/.bin/next build` directly — `pnpm build` triggers a dependency precheck that fails on unapproved build scripts, unrelated to this work.
- Commit style: conventional commits with a scope. No AI attribution.

---

### Task 1: Index computation (pure function)

No network, no database — this is the piece that can be verified exactly.

**Files:**
- Create: `src/lib/switching-index.ts`
- Verify with: `/tmp/switching-verify/verify-index.ts` (not committed)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type OrderRow = { month: string; concelho: string; orderCount: number }` — `month` is `YYYY-MM`
  - `type IndexPoint = { month: string; orders: number; index: number | null }`
  - `type ConcelhoIndex = { concelho: string; baseline: number; latestMonth: string | null; latestIndex: number | null }`
  - `computeDistrictSeries(rows: OrderRow[]): { baseline: number; series: IndexPoint[] }`
  - `computeConcelhoIndexes(rows: OrderRow[]): ConcelhoIndex[]`
  - `BASELINE_FROM`, `BASELINE_TO` string constants

- [ ] **Step 1: Write the failing verification script**

Create `/tmp/switching-verify/verify-index.ts`:

```ts
import {
  computeDistrictSeries,
  computeConcelhoIndexes,
  type OrderRow,
} from "./switching-index.ts";

// Real district totals, independently verified against the live E-REDES API.
const TOTALS: [string, number][] = [
  ["2025-10", 5920], ["2025-11", 5792], ["2025-12", 5407], ["2026-01", 5604],
  ["2026-02", 986],  ["2026-03", 25],   ["2026-04", 18],
  ["2026-05", 7586], ["2026-06", 10101],
];
// Split each month across two concelhos so the district roll-up is exercised.
const rows: OrderRow[] = TOTALS.flatMap(([month, total]) => [
  { month, concelho: "Leiria", orderCount: Math.floor(total / 2) },
  { month, concelho: "Pombal", orderCount: total - Math.floor(total / 2) },
]);

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}  got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}

const d = computeDistrictSeries(rows);
// baseline = mean of Oct, Nov, Dec, Jan = (5920+5792+5407+5604)/4
check("baseline", d.baseline, 5680.75);
check("series length", d.series.length, 9);
check("series is chronological", d.series.map((p) => p.month), TOTALS.map(([m]) => m));
check("Feb orders", d.series.find((p) => p.month === "2026-02")!.orders, 986);
check("Feb index", d.series.find((p) => p.month === "2026-02")!.index, 17.4);
check("Mar index", d.series.find((p) => p.month === "2026-03")!.index, 0.4);
check("Jun index (backlog >100%)", d.series.find((p) => p.month === "2026-06")!.index, 177.8);

// Zero baseline must yield null, not Infinity or NaN.
const zero = computeDistrictSeries([{ month: "2026-05", concelho: "X", orderCount: 10 }]);
check("no baseline months -> baseline 0", zero.baseline, 0);
check("no baseline months -> index null", zero.series[0].index, null);

const per = computeConcelhoIndexes(rows);
check("two concelhos", per.length, 2);
const leiria = per.find((c) => c.concelho === "Leiria")!;
check("Leiria latestMonth", leiria.latestMonth, "2026-06");
check("Leiria baseline", leiria.baseline, 2840.25);

// A concelho present only outside the baseline window has baseline 0.
const orphan = computeConcelhoIndexes([{ month: "2026-06", concelho: "Novo", orderCount: 5 }]);
check("orphan concelho baseline", orphan[0].baseline, 0);
check("orphan concelho index null", orphan[0].latestIndex, null);

console.log(failures === 0 ? "\n  ALL PASS" : `\n  ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to verify it fails**

```bash
mkdir -p /tmp/switching-verify/idx
cp /tmp/switching-verify/verify-index.ts /tmp/switching-verify/idx/
node --experimental-strip-types /tmp/switching-verify/idx/verify-index.ts
```

Expected: FAIL — `Cannot find module './switching-index.ts'`, because
`src/lib/switching-index.ts` does not exist yet and so was never copied in.

- [ ] **Step 3: Write the implementation**

Create `src/lib/switching-index.ts`:

```ts
/**
 * Turns monthly remote-order counts into a recovery index.
 *
 * The index expresses each month as a percentage of a pre-storm baseline, so
 * municipalities of very different sizes stay comparable — Leiria runs roughly
 * 20x the volume of Pedrógão Grande.
 *
 * Values above 100% are backlog catch-up after the outage, not renewed
 * disruption. Any UI rendering this must say so.
 */

export type OrderRow = {
  /** YYYY-MM */
  month: string;
  concelho: string;
  orderCount: number;
};

export type IndexPoint = {
  month: string;
  orders: number;
  /** Percentage of baseline, or null when no baseline could be established. */
  index: number | null;
};

export type ConcelhoIndex = {
  concelho: string;
  baseline: number;
  latestMonth: string | null;
  latestIndex: number | null;
};

/** Pre-storm window. Kristin made landfall 2026-01-28. */
export const BASELINE_FROM = "2025-10";
export const BASELINE_TO = "2026-01";

function isBaselineMonth(month: string): boolean {
  return month >= BASELINE_FROM && month <= BASELINE_TO;
}

/** One decimal place, matching how the index is displayed. */
function toIndex(orders: number, baseline: number): number | null {
  if (baseline <= 0) return null;
  return Math.round((orders / baseline) * 1000) / 10;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Totals per month across every concelho in `rows`. */
function totalsByMonth(rows: OrderRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.month, (totals.get(row.month) ?? 0) + row.orderCount);
  }
  return totals;
}

export function computeDistrictSeries(rows: OrderRow[]): {
  baseline: number;
  series: IndexPoint[];
} {
  const totals = totalsByMonth(rows);
  const baseline = mean(
    [...totals.entries()].filter(([m]) => isBaselineMonth(m)).map(([, v]) => v)
  );

  const series = [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, orders]) => ({
      month,
      orders,
      index: toIndex(orders, baseline),
    }));

  return { baseline: round2(baseline), series };
}

export function computeConcelhoIndexes(rows: OrderRow[]): ConcelhoIndex[] {
  const byConcelho = new Map<string, OrderRow[]>();
  for (const row of rows) {
    const list = byConcelho.get(row.concelho) ?? [];
    list.push(row);
    byConcelho.set(row.concelho, list);
  }

  return [...byConcelho.entries()]
    .map(([concelho, concelhoRows]) => {
      const totals = totalsByMonth(concelhoRows);
      const baseline = mean(
        [...totals.entries()].filter(([m]) => isBaselineMonth(m)).map(([, v]) => v)
      );
      const months = [...totals.keys()].sort((a, b) => a.localeCompare(b));
      const latestMonth = months.at(-1) ?? null;
      const latestOrders = latestMonth ? (totals.get(latestMonth) ?? 0) : 0;

      return {
        concelho,
        baseline: round2(baseline),
        latestMonth,
        latestIndex: latestMonth ? toIndex(latestOrders, baseline) : null,
      };
    })
    .sort((a, b) => a.concelho.localeCompare(b.concelho));
}
```

- [ ] **Step 4: Run the verification script and confirm it passes**

```bash
SCRATCH=/tmp/switching-verify; mkdir -p $SCRATCH/idx
cp src/lib/switching-index.ts /tmp/switching-verify/idx/
cp /tmp/switching-verify/verify-index.ts /tmp/switching-verify/idx/
node --experimental-strip-types /tmp/switching-verify/idx/verify-index.ts
```

Expected: every line `PASS`, then `ALL PASS`, exit 0.

- [ ] **Step 5: Type-check and commit**

```bash
./node_modules/.bin/tsc --noEmit
git add src/lib/switching-index.ts
git commit -m "feat(recovery): add remote switching index computation

Expresses monthly remote-order counts as a percentage of the
pre-storm baseline (2025-10 to 2026-01), so municipalities of very
different volumes stay comparable. A concelho with no baseline months
yields null rather than dividing by zero."
```

---

### Task 2: E-REDES fetcher

**Files:**
- Create: `src/lib/switching-fetcher.ts`
- Modify: `src/lib/constants.ts` (add the dataset id beside the other E-REDES dataset constants)
- Verify with: `/tmp/switching-verify/verify-fetcher.ts` (not committed)

**Interfaces:**
- Consumes: `OrderRow` from `src/lib/switching-index.ts`; `EREDES_BASE` and `LEIRIA_MUNICIPALITIES` from `src/lib/constants.ts`.
- Produces: `fetchSwitchingOrders(): Promise<OrderRow[]>` — throws on a non-OK response.

- [ ] **Step 1: Add the dataset constant**

In `src/lib/constants.ts`, beside `EREDES_POLES_DATASET`:

```ts
export const EREDES_SWITCHING_DATASET = "15-ordens-de-servico";
```

- [ ] **Step 2: Write the failing verification script**

Create `/tmp/switching-verify/verify-fetcher.ts`:

```ts
import { fetchSwitchingOrders } from "./switching-fetcher.ts";
import { computeDistrictSeries } from "./switching-index.ts";

const rows = await fetchSwitchingOrders();
console.log(`  rows fetched: ${rows.length}`);

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}  got=${actual} want=${expected}`);
}

// Pagination must not stop at the first page: total_count lies on group_by.
check("more than one page of groups", rows.length > 100, true);

const { series } = computeDistrictSeries(rows);
const at = (m: string) => series.find((p) => p.month === m)?.orders;

// Independently verified against the live API.
check("2025-10", at("2025-10"), 5920);
check("2025-11", at("2025-11"), 5792);
check("2025-12", at("2025-12"), 5407);
check("2026-01", at("2026-01"), 5604);
check("2026-02", at("2026-02"), 986);
check("2026-03", at("2026-03"), 25);
check("2026-04", at("2026-04"), 18);
check("2026-05", at("2026-05"), 7586);
check("2026-06", at("2026-06"), 10101);

const concelhos = new Set(rows.map((r) => r.concelho));
check("15 municipalities present", concelhos.size, 15);
check("Ourém included", concelhos.has("Ourém"), true);
check("Castanheira de Pêra included", concelhos.has("Castanheira de Pêra"), true);

console.log(failures === 0 ? "\n  ALL PASS" : `\n  ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 3: Run it to verify it fails**

```bash
mkdir -p /tmp/switching-verify/f && cp src/lib/switching-index.ts /tmp/switching-verify/f/
cp /tmp/switching-verify/verify-fetcher.ts /tmp/switching-verify/f/
ln -sfn "$PWD/node_modules" /tmp/switching-verify/f/node_modules
node --experimental-strip-types /tmp/switching-verify/f/verify-fetcher.ts
```

Expected: FAIL — `Cannot find module './switching-fetcher.ts'`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/switching-fetcher.ts`:

```ts
import {
  EREDES_BASE,
  EREDES_SWITCHING_DATASET,
  LEIRIA_MUNICIPALITIES,
} from "@/lib/constants";
import type { OrderRow } from "@/lib/switching-index";

/**
 * The four remotely-commanded order types.
 *
 * These strings are double-encoded in the source data — the API genuinely
 * returns "InterrupÃ§Ãµes" rather than "Interrupções". Querying the correctly
 * spelled value matches zero rows AND returns no error, so the mojibake must
 * be preserved verbatim. Do not "fix" these literals.
 */
const REMOTE_ORDER_TYPES = [
  "InterrupÃ§Ãµes",
  "Restabelecimentos",
  "ReduÃ§Ãµes temporÃ¡rias PotÃªncia Contratada",
  "ReposiÃ§Ãµes PotÃªncia Contratada",
] as const;

const PAGE_SIZE = 100;
const MAX_OFFSET = 10_000;

function quotedList(values: readonly string[]): string {
  // Values are internal constants, not user input, and contain no quotes.
  return values.map((v) => `"${v}"`).join(",");
}

function buildUrl(offset: number): string {
  const url = new URL(
    `${EREDES_BASE}/catalog/datasets/${EREDES_SWITCHING_DATASET}/records`
  );
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("group_by", "data,concelho");
  url.searchParams.set(
    "select",
    "data,concelho,sum(ordens_servico_realizadas) as n"
  );
  // Filter on concelho, never distrito: Ourém is administratively Santarém,
  // and distrito='Leiria' would also pull in Bombarral and Óbidos.
  url.searchParams.set(
    "where",
    `concelho in (${quotedList(LEIRIA_MUNICIPALITIES)}) ` +
      `and tipo_de_servico in (${quotedList(REMOTE_ORDER_TYPES)})`
  );
  return url.toString();
}

/**
 * Fetches monthly remote-order counts per municipality.
 *
 * Pages until a short page is returned. `total_count` cannot drive pagination:
 * on group_by queries E-REDES caps it at the page size, reporting 100 for a
 * ~950-group result, which would silently yield only the oldest 100 months.
 */
export async function fetchSwitchingOrders(): Promise<OrderRow[]> {
  const rows: OrderRow[] = [];

  for (let offset = 0; offset < MAX_OFFSET; offset += PAGE_SIZE) {
    const res = await fetch(buildUrl(offset), {
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(
        `E-REDES ${EREDES_SWITCHING_DATASET} responded with ${res.status}`
      );
    }

    const json = await res.json();
    const results: Record<string, unknown>[] = json.results ?? [];

    for (const r of results) {
      const rawMonth = r["data"];
      const concelho = r["concelho"];
      if (typeof rawMonth !== "string" || typeof concelho !== "string") continue;
      rows.push({
        month: rawMonth.slice(0, 7), // "2026-02-01T00:00:00+00:00" -> "2026-02"
        concelho,
        orderCount: Number(r["n"] ?? 0),
      });
    }

    if (results.length < PAGE_SIZE) break;
  }

  return rows;
}
```

- [ ] **Step 5: Run the verification script and confirm it passes**

```bash
mkdir -p /tmp/switching-verify/f && cp src/lib/switching-index.ts /tmp/switching-verify/f/
sed 's|from "@/lib/constants"|from "./constants.ts"|; s|from "@/lib/switching-index"|from "./switching-index.ts"|' \
  src/lib/switching-fetcher.ts > /tmp/switching-verify/f/switching-fetcher.ts
cp src/lib/constants.ts /tmp/switching-verify/f/
cp /tmp/switching-verify/verify-fetcher.ts /tmp/switching-verify/f/
ln -sfn "$PWD/node_modules" /tmp/switching-verify/f/node_modules
node --experimental-strip-types /tmp/switching-verify/f/verify-fetcher.ts
```

Expected: `rows fetched: 952` (or more as months accrue), every check `PASS`, `ALL PASS`.

- [ ] **Step 6: Type-check and commit**

```bash
./node_modules/.bin/tsc --noEmit
git add src/lib/constants.ts src/lib/switching-fetcher.ts
git commit -m "feat(recovery): fetch remote switching orders from E-REDES

Pages until a short page rather than trusting total_count, which
E-REDES caps at the page size on group_by queries — it reports 100 for
a 952-group result.

The tipo_de_servico literals are deliberately double-encoded to match
the source data; the correctly spelled values match zero rows and
return no error."
---

### Task 3: Table and ingestion cron

**Files:**
- Modify: `src/db/schema.ts` (append a table)
- Create: `src/app/api/cron/switching/route.ts`
- Modify: `vercel.json` (add a fifth cron entry)

**Interfaces:**
- Consumes: `fetchSwitchingOrders()` from Task 2.
- Produces: `switchingOrders` table export from `src/db/schema.ts`, with columns
  `id`, `month` (date), `concelho` (text), `orderCount` (integer), `fetchedAt` (timestamptz).

- [ ] **Step 1: Add the table**

Append to `src/db/schema.ts`:

```ts
export const switchingOrders = pgTable(
  "switching_orders",
  {
    id: serial("id").primaryKey(),
    // First day of the month the count covers.
    month: date("month").notNull(),
    concelho: text("concelho").notNull(),
    orderCount: integer("order_count").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("switching_orders_month_concelho_idx").on(table.month, table.concelho)]
);
```

`pgTable`, `serial`, `date`, `text`, `integer`, `timestamp` and `uniqueIndex` are already imported at the top of the file.

- [ ] **Step 2: Apply the schema locally and confirm the table exists**

```bash
docker compose up -d
export DATABASE_URL="postgres://leiria:leiria@localhost:5436/leiria_monitor"
pnpm db:push
psql "$DATABASE_URL" -c "\d switching_orders"
```

Expected: the table lists all five columns plus the unique index on `(month, concelho)`.

- [ ] **Step 3: Write the cron route**

Create `src/app/api/cron/switching/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { switchingOrders } from "@/db/schema";
import { verifyCronSecret } from "@/lib/cron-auth";
import { fetchSwitchingOrders } from "@/lib/switching-fetcher";

export const maxDuration = 60;

const BATCH = 500;

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const rows = await fetchSwitchingOrders();

    if (rows.length === 0) {
      console.error("[cron/switching] fetch returned no rows — leaving table untouched");
      return NextResponse.json(
        {
          success: false,
          error: "E-REDES returned no rows; existing data left in place",
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    // Upsert rather than delete-and-replace, so a partial fetch can never
    // empty the table. Retained history is deliberate: E-REDES has already
    // deleted one dataset this project depended on.
    const values = rows.map((r) => ({
      month: `${r.month}-01`,
      concelho: r.concelho,
      orderCount: r.orderCount,
      fetchedAt: new Date(),
    }));

    for (let i = 0; i < values.length; i += BATCH) {
      await db
        .insert(switchingOrders)
        .values(values.slice(i, i + BATCH))
        .onConflictDoUpdate({
          target: [switchingOrders.month, switchingOrders.concelho],
          set: {
            orderCount: sql`excluded.order_count`,
            fetchedAt: sql`excluded.fetched_at`,
          },
        });
    }

    const months = new Set(rows.map((r) => r.month));
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      detail: {
        rows: rows.length,
        months: months.size,
        latestMonth: [...months].sort().at(-1) ?? null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[cron/switching] ingestion failed:", message);
    return NextResponse.json(
      { success: false, error: message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Run the cron locally and verify the rows land**

```bash
export DATABASE_URL="postgres://leiria:leiria@localhost:5436/leiria_monitor"
export CRON_SECRET="localdev"
./node_modules/.bin/next dev &
sleep 12
curl -s -H "Authorization: Bearer localdev" http://localhost:3000/api/cron/switching | head -c 400
psql "$DATABASE_URL" -c "select count(*) as rows, count(distinct month) as months, max(month) as latest from switching_orders;"
psql "$DATABASE_URL" -c "select month, sum(order_count) from switching_orders where month >= '2025-10-01' group by month order by month;"
```

Expected: `success: true` with ~952 rows; the monthly sums reproduce
5920 / 5792 / 5407 / 5604 / 986 / 25 / 18 / 7586 / 10101.

- [ ] **Step 5: Verify the upsert is idempotent**

```bash
curl -s -H "Authorization: Bearer localdev" http://localhost:3000/api/cron/switching > /dev/null
psql "$DATABASE_URL" -c "select count(*) from switching_orders;"
```

Expected: the same row count as Step 4 — a second run updates in place and does not duplicate.

- [ ] **Step 6: Register the cron**

In `vercel.json`, add to the `crons` array:

```json
{ "path": "/api/cron/switching", "schedule": "0 4 * * 1" }
```

Weekly: the data lands monthly but at an unpredictable point. This is the fifth
cron entry — confirm the Vercel plan permits it.

- [ ] **Step 7: Type-check, build and commit**

```bash
kill %1 2>/dev/null
./node_modules/.bin/tsc --noEmit
rm -rf .next && ./node_modules/.bin/next build
git add src/db/schema.ts src/app/api/cron/switching/route.ts vercel.json
git commit -m "feat(recovery): ingest remote switching orders into switching_orders

Upserts on (month, concelho) rather than replacing the table, so a
failed or partial fetch cannot empty it, and returns 500 with detail
when ingestion fails instead of reporting success regardless."
```

- [ ] **Step 8: Apply the schema to production**

`drizzle-kit push` is the only migration mechanism in this repo and nothing runs
it on deploy, so the table must be created in the production database explicitly:

```bash
DATABASE_URL="<production Neon URL>" pnpm db:push
```

The change is purely additive (one new table plus its unique index). Confirm
`drizzle-kit`'s printed plan contains no `DROP` before accepting it. If the
production `DATABASE_URL` is not available in this session, stop and hand this
step to the project owner — the API in Task 4 returns an empty series until it
is done, which degrades to a hidden card rather than an error.

---

### Task 4: Public API route

**Files:**
- Create: `src/app/api/electricity/switching/route.ts`

**Interfaces:**
- Consumes: `switchingOrders` (Task 3); `computeDistrictSeries`, `computeConcelhoIndexes`, `BASELINE_FROM`, `BASELINE_TO` (Task 1).
- Produces: `GET /api/electricity/switching` returning
  `{ success, timestamp, baselineWindow: { from, to }, district: { baseline, series }, byConcelho }`.

- [ ] **Step 1: Write the route**

Create `src/app/api/electricity/switching/route.ts`:

```ts
import { NextResponse } from "next/server";
import { db } from "@/db";
import { switchingOrders } from "@/db/schema";
import {
  computeConcelhoIndexes,
  computeDistrictSeries,
  BASELINE_FROM,
  BASELINE_TO,
  type OrderRow,
} from "@/lib/switching-index";

// Monthly data — an hour of caching is generous.
export const revalidate = 3600;

export async function GET() {
  try {
    const records = await db
      .select({
        month: switchingOrders.month,
        concelho: switchingOrders.concelho,
        orderCount: switchingOrders.orderCount,
      })
      .from(switchingOrders);

    // The column is a date holding the first of the month; the API speaks YYYY-MM.
    const rows: OrderRow[] = records.map((r) => ({
      month: String(r.month).slice(0, 7),
      concelho: r.concelho,
      orderCount: r.orderCount,
    }));

    const district = computeDistrictSeries(rows);
    const byConcelho = computeConcelhoIndexes(rows);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      source: "E-REDES — Ordens de serviço realizadas remotamente",
      baselineWindow: { from: BASELINE_FROM, to: BASELINE_TO },
      district,
      byConcelho,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
        district: { baseline: 0, series: [] },
        byConcelho: [],
      },
      { status: 500 }
    );
  }
}
```

An empty table yields `district.series: []` with `success: true`, which Task 5
renders as a hidden card rather than an error.

- [ ] **Step 2: Verify the response against the local database**

```bash
export DATABASE_URL="postgres://leiria:leiria@localhost:5436/leiria_monitor"
./node_modules/.bin/next dev &
sleep 12
curl -s http://localhost:3000/api/electricity/switching | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('success      :', d['success'])
print('baseline     :', d['district']['baseline'])
print('series months:', len(d['district']['series']))
print('concelhos    :', len(d['byConcelho']))
for m in ('2026-02', '2026-03', '2026-06'):
    p = next((x for x in d['district']['series'] if x['month'] == m), None)
    print(f'  {m}: orders={p[\"orders\"]} index={p[\"index\"]}%')
"
kill %1 2>/dev/null
```

Expected: `baseline 5680.75`, 15 concelhos, `2026-02` index `17.4`,
`2026-03` index `0.4`, `2026-06` index `177.8`.

- [ ] **Step 3: Type-check, build and commit**

```bash
./node_modules/.bin/tsc --noEmit
rm -rf .next && ./node_modules/.bin/next build
git add src/app/api/electricity/switching/route.ts
git commit -m "feat(api): serve the remote switching recovery index

Returns the district monthly series plus a per-concelho latest index.
An empty table yields an empty series with success:true, so a cold
start hides the card instead of surfacing an error."
```

---

### Task 5: Chart component and /recovery card

**Files:**
- Create: `src/components/switching-index-chart.tsx`
- Modify: `src/app/recovery/page.tsx`

**Interfaces:**
- Consumes: `IndexPoint` from Task 1; `GET /api/electricity/switching` from Task 4.
- Produces: `<SwitchingIndexChart series={IndexPoint[]} />`.

- [ ] **Step 1: Write the chart component**

Create `src/components/switching-index-chart.tsx`:

```tsx
"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IndexPoint } from "@/lib/switching-index";

const MONTHS_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** "2026-02" -> "fev 26" */
function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  return `${MONTHS_PT[Number(m) - 1] ?? m} ${year.slice(2)}`;
}

export function SwitchingIndexChart({ series }: { series: IndexPoint[] }) {
  if (series.length === 0) return null;

  const data = series.map((p) => ({
    month: formatMonth(p.month),
    index: p.index,
    orders: p.orders,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="switchingGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v: number) => `${v}%`}
        />
        <ReferenceLine
          y={100}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          label={{
            value: "normal",
            position: "insideTopRight",
            fontSize: 10,
            fill: "var(--muted-foreground)",
          }}
        />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number, _name, item) => [
            `${value}% (${item.payload.orders.toLocaleString("pt-PT")} ordens)`,
            "Índice",
          ]}
        />
        <Area
          type="monotone"
          dataKey="index"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#switchingGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Fetch the data on /recovery**

In `src/app/recovery/page.tsx`, add the import beside the other chart imports:

```tsx
import { SwitchingIndexChart } from "@/components/switching-index-chart";
```

Add state beside the other `useState` declarations (around line 190):

```tsx
const [switchingData, setSwitchingData] = useState<{
  baselineWindow: { from: string; to: string };
  district: { baseline: number; series: { month: string; orders: number; index: number | null }[] };
} | null>(null);
```

Extend the existing `Promise.allSettled` block so the new request joins the
others rather than adding a second waterfall:

```tsx
useEffect(() => {
  Promise.allSettled([
    fetch("/api/reports").then((r) => r.json()),
    fetch("/api/electricity/substations").then((r) => r.json()),
    fetch("/api/telecom").then((r) => r.json()),
    fetch("/api/electricity/switching").then((r) => r.json()),
  ]).then(([reportsResult, subResult, telecomResult, switchingResult]) => {
    if (reportsResult.status === "fulfilled") setReportsData(reportsResult.value);
    if (subResult.status === "fulfilled") setSubData(subResult.value);
    if (telecomResult.status === "fulfilled") setTelecomData(telecomResult.value);
    if (switchingResult.status === "fulfilled" && switchingResult.value?.success) {
      setSwitchingData(switchingResult.value);
    }
    setLoading(false);
  });
}, []);
```

- [ ] **Step 3: Add the lead card**

In `src/app/recovery/page.tsx`, inside the `{tab === "electricity" && (` block,
**before** the existing `Reportes por Freguesia` card:

```tsx
{switchingData && switchingData.district.series.length > 0 && (
  <Card>
    <CardHeader>
      <CardTitle className="text-sm">Índice de Recuperação da Rede</CardTitle>
    </CardHeader>
    <CardContent>
      <SwitchingIndexChart series={switchingData.district.series} />
      <p className="mt-2 text-xs text-muted-foreground">
        Ordens de serviço executadas remotamente pela E-REDES nos 15 concelhos do
        distrito, em percentagem da média pré-tempestade ({switchingData.baselineWindow.from} a{" "}
        {switchingData.baselineWindow.to}). Valores acima de 100% correspondem à
        recuperação do trabalho acumulado, não a nova disrupção.
      </p>
    </CardContent>
  </Card>
)}
```

- [ ] **Step 4: Note the E-REDES cut-off on both substation cards**

In the `Recuperação Energética — Subestações` card, append to the existing
caption paragraph (after "20–25 Jan)."):

```tsx
{" "}Dados E-REDES disponíveis até 05/05/2026.
```

In the `Carga por Subestação` card, append to the caption inside the
`selectedSubstation && subData.perSubstation?.[selectedSubstation]` branch,
after "Última carga: … MW.":

```tsx
{" "}Dados E-REDES disponíveis até 05/05/2026.
```

- [ ] **Step 5: Verify the page renders**

```bash
export DATABASE_URL="postgres://leiria:leiria@localhost:5436/leiria_monitor"
./node_modules/.bin/next dev &
sleep 12
curl -s http://localhost:3000/recovery -o /dev/null -w "http=%{http_code}\n"
```

Then open `http://localhost:3000/recovery` and confirm: the new card leads the
electricity tab, the curve drops to near zero across Feb–Apr 2026 and overshoots
100% in May–Jun, the dashed reference line sits at 100%, and both substation
captions carry the cut-off note.

- [ ] **Step 6: Type-check, build and commit**

```bash
kill %1 2>/dev/null
./node_modules/.bin/tsc --noEmit
rm -rf .next && ./node_modules/.bin/next build
git add src/components/switching-index-chart.tsx src/app/recovery/page.tsx
git commit -m "feat(recovery): lead with the remote switching recovery index

Adds the index chart as the first card on the electricity tab and
records the 05/05/2026 E-REDES cut-off on both substation captions, so
their flatline reads as a known upstream limit rather than a fault."
```

---

### Task 6: Per-concelho figure on council pages

**Files:**
- Modify: `src/app/api/dashboard/area/route.ts`
- Modify: `src/lib/types.ts` (extend `AreaDashboardData`)
- Modify: `src/app/council/[slug]/page.tsx`

**Interfaces:**
- Consumes: `switchingOrders` (Task 3), `computeConcelhoIndexes` (Task 1).
- Produces: a `switching: { latestIndex: number | null; latestMonth: string | null; baseline: number } | null` field on the area dashboard response.

- [ ] **Step 1: Extend the area API**

In `src/app/api/dashboard/area/route.ts`, add to the imports:

```ts
import { switchingOrders } from "@/db/schema";
import { computeConcelhoIndexes, type OrderRow } from "@/lib/switching-index";
```

Then, after the transformer block and before the response is assembled:

```ts
// Per-concelho recovery index. Uses the canonical municipality spelling so a
// mis-cased query param cannot silently match zero rows.
let switching: {
  latestIndex: number | null;
  latestMonth: string | null;
  baseline: number;
} | null = null;

if (canonical) {
  try {
    const records = await db
      .select({
        month: switchingOrders.month,
        concelho: switchingOrders.concelho,
        orderCount: switchingOrders.orderCount,
      })
      .from(switchingOrders)
      .where(eq(switchingOrders.concelho, canonical));

    const rows: OrderRow[] = records.map((r) => ({
      month: String(r.month).slice(0, 7),
      concelho: r.concelho,
      orderCount: r.orderCount,
    }));

    const computed = computeConcelhoIndexes(rows)[0];
    if (computed) {
      switching = {
        latestIndex: computed.latestIndex,
        latestMonth: computed.latestMonth,
        baseline: computed.baseline,
      };
    }
  } catch (error) {
    console.warn(`[dashboard/area] switching index failed for '${canonical}':`, error);
  }
}
```

Add `switching` to the JSON response object alongside `transformers`.

- [ ] **Step 2: Extend the shared type**

In `src/lib/types.ts`, add to the `AreaDashboardData` interface:

```ts
switching: {
  latestIndex: number | null;
  latestMonth: string | null;
  baseline: number;
} | null;
```

- [ ] **Step 3: Show it on the council page**

In `src/app/council/[slug]/page.tsx`, beside the existing
"postos de transformação no concelho" line:

```tsx
{data?.switching?.latestIndex != null && (
  <p className="text-sm text-muted-foreground">
    Índice de recuperação da rede:{" "}
    <span className="font-medium text-foreground">
      {data.switching.latestIndex}%
    </span>{" "}
    ({data.switching.latestMonth}) face à média pré-tempestade
  </p>
)}
```

- [ ] **Step 4: Verify against the local database**

```bash
export DATABASE_URL="postgres://leiria:leiria@localhost:5436/leiria_monitor"
./node_modules/.bin/next dev &
sleep 12
for c in "Leiria" "Our%C3%A9m" "Pedr%C3%B3g%C3%A3o%20Grande"; do
  echo "--- $c"
  curl -s "http://localhost:3000/api/dashboard/area?concelho=$c" \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(' switching:',d.get('switching'))"
done
kill %1 2>/dev/null
```

Expected: each returns a `switching` object with a non-null `latestIndex` and a
`latestMonth` of the most recent ingested month. Pedrógão Grande's index should
be on the same 0–200 scale as Leiria's despite far smaller absolute volumes —
that is the normalisation working.

- [ ] **Step 5: Type-check, build and commit**

```bash
./node_modules/.bin/tsc --noEmit
rm -rf .next && ./node_modules/.bin/next build
git add src/app/api/dashboard/area/route.ts src/lib/types.ts "src/app/council/[slug]/page.tsx"
git commit -m "feat(council): show the per-concelho recovery index

Gives council pages their first recovery metric beyond report counts.
The index is normalised against each concelho's own pre-storm baseline,
so small municipalities stay comparable with Leiria."
```

---

## Post-deploy verification

- [ ] Push and confirm the Vercel deployment reaches `READY`.
- [ ] Confirm the production schema was applied (Task 3 Step 8); without it the
      API returns an empty series and the card stays hidden.
- [ ] Trigger the cron once by hand:
      `curl -H "Authorization: Bearer $CRON_SECRET" https://www.redesentinela.com/api/cron/switching`
      and confirm `success: true` with ~952 rows.
- [ ] `curl https://www.redesentinela.com/api/electricity/switching` and confirm
      `baseline 5680.75` with 15 concelhos.
- [ ] Load `https://www.redesentinela.com/recovery` and confirm the index card
      leads the electricity tab and both substation captions show the cut-off note.
- [ ] Load `https://www.redesentinela.com/council/ourem` and confirm the index appears.
