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

/**
 * Normalises a `month` value read from the database to `YYYY-MM`.
 *
 * The value's runtime type depends on the driver: drizzle's node-postgres
 * adapter overrides the DATE type parser to identity and yields the raw string
 * `"2026-02-01"`, while the neon-http path used in production yields a `Date`.
 *
 * Uses local date parts rather than toISOString(): the driver builds the Date
 * at local midnight, so in any timezone ahead of UTC toISOString() would report
 * the previous month for the first of the month.
 */
export function toYearMonth(value: unknown): string {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  }
  return String(value).slice(0, 7);
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
