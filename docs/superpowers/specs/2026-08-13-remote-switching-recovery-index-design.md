# Remote Switching Recovery Index — design

**Date:** 2026-08-13
**Status:** approved, ready for implementation planning

## Problem

`/recovery` leads with a substation load chart whose upstream dataset
(`diagrama_carga_subestacao_08_a_10`) stopped publishing on 2026-05-05 for every
district it covers. The chart therefore flatlines three months in the past, and
no amount of work on our side can extend it.

Separately, the dashboard has had no grid-disruption signal at all since
`outages-per-geography` — the dataset that once fed active outage counts per
municipality — was deleted from the E-REDES catalogue. A survey of all 66
datasets found no live replacement.

## The signal

`15-ordens-de-servico` records completed work orders per month, per parish, by
order type. Summing the four remotely-commanded types across the 15 target
municipalities produces a legible collapse-and-recovery curve:

| month | remote orders | back-office control |
|---|---|---|
| 2025-10 | 5,920 | 2,125 |
| 2025-11 | 5,792 | 2,219 |
| 2025-12 | 5,407 | 2,444 |
| 2026-01 | 5,604 | 2,619 |
| **2026-02** | **986** | 1,963 |
| **2026-03** | **25** | 2,488 |
| **2026-04** | **18** | 2,348 |
| 2026-05 | 7,586 | 2,361 |
| 2026-06 | 10,101 | 2,299 |

The control column is what makes this trustworthy. The obvious objection is that
Leiria simply stopped reporting for two months — but back-office order types
(Ativações, Desativações, Alteração Contratual) held flat over the same window in
the same municipalities. A reporting outage would have flattened both series.

The dataset currently extends to 2026-07 and advances monthly with roughly a
two-month lag.

**This is a recovery-trend instrument, not a status indicator.** It must never be
labelled "current outages" or placed on `/situation`.

## Decisions

| decision | choice |
|---|---|
| Placement | New card leads `/recovery`'s electricity tab. Both substation charts stay, each gaining a "dados E-REDES até 05/05/2026" note. |
| Granularity | District aggregate line, plus a per-concelho figure that `/council/[slug]` also consumes. |
| Metric | Index against a pre-storm baseline, expressed as a percentage. |
| Architecture | Relational table + cron (the repo's pattern 1), not a JSONB cache. |

Architecture rationale: the data is monthly, tabular and small, with two
consumers needing two different shapes. Retaining our own history is a
deliberate hedge — one E-REDES dataset in this project has already been deleted
outright and another frozen mid-flight.

## Components

### `switching_orders` table (`src/db/schema.ts`)

| column | type | notes |
|---|---|---|
| `id` | serial | primary key |
| `month` | date | first day of the month |
| `concelho` | text | municipality name as E-REDES spells it |
| `orderCount` | integer | summed remote orders |
| `fetchedAt` | timestamptz | defaults to now |

Unique index on `(month, concelho)`. About 952 rows today, growing ~15 per month.

### `src/lib/switching-fetcher.ts`

Owns all external access, following the existing `*-fetcher.ts` convention.

Two traps it must handle, both verified against the live API:

1. **`tipo_de_servico` must be queried with correct UTF-8 diacritics** —
   `'Interrupções'`, not a mojibake or ASCII-folded variant. A wrong variant
   matches zero rows for that type *with no error*, so it drops silently out of
   the sum and the totals look plausible but are wrong (333 instead of 5920 for
   2025-10). Confusingly, E-REDES double-encodes these values in its JSON
   *response*, so listing them via `group_by` prints the mojibake form; that is a
   response-serialisation artifact and must never be copied into a query.
2. **`total_count` is capped at the page size on `group_by` queries** — it
   reports 100 for a 952-group result. Pagination must continue until a page
   returns fewer rows than the page size. Trusting `total_count` here would
   silently yield only the oldest 100 groups, starting 2020-11.

Filters by `concelho in (...)` using `LEIRIA_MUNICIPALITIES`, never
`distrito='Leiria'` — Ourém is administratively Santarém, and the district
filter also pulls in Bombarral and Óbidos.

Exported: `fetchSwitchingOrders(): Promise<{ month: string; concelho: string; orderCount: number }[]>`.
Throws on a non-OK response.

### `src/lib/switching-index.ts`

A pure function over rows — no network, no database — so it can be verified
directly.

- Baseline: mean monthly total over **2025-10 → 2026-01**.
- Index: `total / baseline * 100`.
- Per-concelho uses that concelho's own baseline, which is what makes Leiria
  comparable to Pedrógão Grande despite roughly 20× the volume.
- A concelho whose baseline is zero yields `null`, not a division by zero.

### `/api/cron/switching`

`verifyCronSecret`, then upsert on `(month, concelho)` — deliberately not
delete-and-replace, so a failed fetch cannot empty the table. Returns 500 with
per-step detail on failure, matching the reporting convention established in
`/api/cron/ingest-all`.

Scheduled weekly in `vercel.json`: `0 4 * * 1`. The data lands monthly but at an
unpredictable point in the month, and a weekly check costs nothing. This becomes
the fifth entry in `vercel.json`; confirm the Vercel plan permits it before
relying on the schedule, since the file is the authoritative cron wiring.

### `/api/electricity/switching`

`export const revalidate = 3600`.

Shape (district figures are real; the `byConcelho` entry is illustrative):

```json
{
  "success": true,
  "timestamp": "2026-08-13T10:00:00.000Z",
  "baselineWindow": { "from": "2025-10", "to": "2026-01" },
  "district": {
    "baseline": 5680.75,
    "series": [{ "month": "2026-02", "orders": 986, "index": 17.4 }]
  },
  "byConcelho": [
    { "concelho": "Leiria", "baseline": 0, "latestIndex": 0, "latestMonth": "2026-07" }
  ]
}
```

`month` is serialised as `YYYY-MM` throughout the API, though the column is a
`date` holding the first of the month. `latestMonth` and `latestIndex` refer to
the most recent month present **for that concelho**, which may differ between
concelhos if E-REDES publishes unevenly.

When the table is empty the route returns `success: true` with an empty
`district.series`, so a cold start shows one fewer card rather than an error.

### `/api/dashboard/area`

Gains a `switching: { latestIndex, latestMonth, baseline } | null` block, read
from the same table for the requested concelho. Null when that concelho has no
rows.

### `src/components/switching-index-chart.tsx`

Recharts, y-axis in percent, reference line at 100%, storm month marked. Renders
nothing when the series is empty.

### `/recovery` integration

New lead card on the electricity tab titled **Índice de Recuperação da Rede**,
conditionally rendered exactly as the existing `subData` cards are. Caption
states the baseline window and that **values above 100% are backlog catch-up,
not renewed disruption** — without that line, the May/June overshoot reads as a
second crisis.

Both substation cards gain a note recording that E-REDES data ends 2026-05-05.

## Failure behaviour

| failure | behaviour |
|---|---|
| E-REDES non-OK | fetcher throws; cron returns 500 with detail |
| Partial page failure during pagination | warn and continue; never silently truncate |
| Table empty | API returns empty series; `/recovery` hides the card |
| Concelho with zero baseline | index is `null`; chart skips the point |

## Verification

The repository has no test framework, so verification is explicit:

1. Run the real fetcher against the live API via `node --experimental-strip-types`
   and assert it reproduces the independently verified series
   (5,920 / 5,792 / 5,407 / 5,604 / 986 / 25 / 18 / 7,586 / 10,101).
2. Check `switching-index.ts` against a hand-computed baseline.
3. Confirm pagination returns 952 groups, not 100.
4. `tsc --noEmit` and a clean production build.
5. After deploy: verify the API shape, then confirm the card renders on
   `/recovery` and the per-concelho figure appears on a council page.

## Out of scope

- The per-freguesia choropleth on `/map`.
- Any change to how the substation charts compute their data — they gain a note
  and nothing more.
- Retiring the substation charts.
