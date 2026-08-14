import {
  EREDES_BASE,
  EREDES_SWITCHING_DATASET,
  LEIRIA_MUNICIPALITIES,
} from "@/lib/constants";
import type { OrderRow } from "@/lib/switching-index";

/**
 * The four remotely-commanded order types.
 *
 * The API requires the exact, correctly-encoded UTF-8 spelling, diacritics
 * included (ç, õ, á, ã, ê). A mojibake or ASCII-folded variant of an accented
 * value matches zero rows for that type AND returns no error — it just
 * silently drops out of the sum. Restabelecimentos has no accents, so it is
 * unaffected either way. Verified against the live API: querying with these
 * exact literals reproduces the district totals independently checked for
 * 2025-10 through 2026-06.
 */
const REMOTE_ORDER_TYPES = [
  "Interrupções",
  "Restabelecimentos",
  "Reduções temporárias Potência Contratada",
  "Reposições Potência Contratada",
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
