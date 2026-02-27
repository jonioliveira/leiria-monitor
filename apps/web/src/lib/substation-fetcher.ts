import { EREDES_BASE, EREDES_SUBSTATION_DATASET } from "@/lib/constants";

// Fetch all pages in parallel batches of 10
async function fetchAllPages(
  baseUrl: URL,
  signal: AbortSignal,
  pageSize = 100
): Promise<Record<string, unknown>[]> {
  const res = await fetch(baseUrl.toString(), {
    signal,
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`E-REDES API responded with ${res.status}`);
  const json = await res.json();
  const total = json.total_count ?? 0;
  const allResults = [...(json.results ?? [])];

  const offsets: number[] = [];
  for (let o = pageSize; o < Math.min(total, 10000); o += pageSize) {
    offsets.push(o);
  }

  for (let i = 0; i < offsets.length; i += 10) {
    const batch = offsets.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map((offset) => {
        const pageUrl = new URL(baseUrl.toString());
        pageUrl.searchParams.set("offset", String(offset));
        return fetch(pageUrl.toString(), { signal, next: { revalidate: 300 } });
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.ok) {
        const pageJson = await r.value.json();
        allResults.push(...(pageJson.results ?? []));
      }
    }
  }

  return allResults;
}

export async function fetchSubstationData(): Promise<{
  success: true;
  timestamp: string;
  source: string;
  substations: { name: string; latestLoad: number | null }[];
  baseline: number;
  actual: { time: string; totalLoad: number }[];
  projection: { time: string; projectedLoad: number }[];
  perSubstation: Record<
    string,
    { actual: { time: string; totalLoad: number }[]; baseline: number }
  >;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);

  // Dynamic end date: today in UTC (data is available with ~1 day lag)
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10); // "YYYY-MM-DD"

  try {
    // Fetch Jan 20 – today: covers baseline (20-25), storm (28), full recovery
    const hourlyUrl = new URL(
      `${EREDES_BASE}/catalog/datasets/${EREDES_SUBSTATION_DATASET}/records`
    );
    hourlyUrl.searchParams.set("limit", "100");
    hourlyUrl.searchParams.set(
      "where",
      `distrito='Leiria' AND datahora>='2026-01-20' AND datahora<='${todayStr}'`
    );
    hourlyUrl.searchParams.set(
      "select",
      "date_format(datahora,'yyyy-MM-dd HH') as hour,sum(energia) as total_energia"
    );
    hourlyUrl.searchParams.set(
      "group_by",
      "date_format(datahora,'yyyy-MM-dd HH')"
    );
    hourlyUrl.searchParams.set("order_by", "hour");

    // Per-substation latest readings — build URL manually to avoid URLSearchParams
    // encoding spaces as '+' which the E-REDES raw-record endpoint rejects
    const latestUrlStr =
      `${EREDES_BASE}/catalog/datasets/${EREDES_SUBSTATION_DATASET}/records` +
      `?limit=100` +
      `&where=${encodeURIComponent(`distrito='Leiria' AND datahora>='2026-01-20'`)}` +
      `&order_by=datahora%20DESC`;

    // Per-substation daily data for individual charts (daily granularity keeps row count low)
    const perSubHourlyUrl = new URL(
      `${EREDES_BASE}/catalog/datasets/${EREDES_SUBSTATION_DATASET}/records`
    );
    perSubHourlyUrl.searchParams.set("limit", "100");
    perSubHourlyUrl.searchParams.set(
      "where",
      `distrito='Leiria' AND datahora>='2026-01-20' AND datahora<='${todayStr}'`
    );
    perSubHourlyUrl.searchParams.set(
      "select",
      "subestacao,date_format(datahora,'yyyy-MM-dd') as day,sum(energia) as total_energia"
    );
    perSubHourlyUrl.searchParams.set(
      "group_by",
      "subestacao,date_format(datahora,'yyyy-MM-dd')"
    );
    perSubHourlyUrl.searchParams.set("order_by", "subestacao,day");

    const [hourlyResults, latestRes, perSubResults] = await Promise.allSettled([
      fetchAllPages(hourlyUrl, controller.signal),
      fetch(latestUrlStr, {
        signal: controller.signal,
        cache: "no-store",
      }),
      fetchAllPages(perSubHourlyUrl, controller.signal),
    ]);

    // Process hourly data into three series: baseline, actual, projection
    const hourlyRaw: { hour: string; energia: number }[] = [];
    if (hourlyResults.status === "fulfilled") {
      for (const r of hourlyResults.value) {
        const hourKey =
          (r["hour"] as string | null) ||
          (r["date_format(datahora,'yyyy-MM-dd HH')"] as string | null) ||
          "";
        const energia = (r["total_energia"] as number) ?? 0;
        hourlyRaw.push({ hour: hourKey, energia });
      }
    }
    hourlyRaw.sort((a, b) => a.hour.localeCompare(b.hour));

    // Baseline: Jan 20-25 average per hour-of-day (0-23)
    const baselineByHour = new Map<number, number[]>();
    for (const r of hourlyRaw) {
      if (r.hour >= "2026-01-20" && r.hour < "2026-01-26") {
        const hourOfDay = parseInt(r.hour.slice(-2), 10);
        const arr = baselineByHour.get(hourOfDay) ?? [];
        arr.push(r.energia / 1000); // kWh -> MWh approx
        baselineByHour.set(hourOfDay, arr);
      }
    }
    const baselineAvg = new Map<number, number>();
    for (const [h, values] of baselineByHour) {
      baselineAvg.set(
        h,
        Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) /
          100
      );
    }

    // Actual data: full period Jan 20 – today
    const actual = hourlyRaw.map((r) => ({
      time: r.hour,
      totalLoad: Math.round((r.energia / 1000) * 100) / 100,
    }));

    // Get the last known load and date for projection
    const lastActual = actual[actual.length - 1];
    const lastLoad = lastActual?.totalLoad ?? 0;
    const overallBaseline =
      baselineAvg.size > 0
        ? Math.round(
            ([...baselineAvg.values()].reduce((a, b) => a + b, 0) /
              baselineAvg.size) *
              100
          ) / 100
        : 0;

    // Projection: linear interpolation from last actual toward baseline over 7 days
    const projection: { time: string; projectedLoad: number }[] = [];
    if (lastActual && overallBaseline > 0) {
      const gap = overallBaseline - lastLoad;
      const projectionHours = 7 * 24; // 7 days
      for (let i = 1; i <= projectionHours; i += 3) {
        // Every 3 hours to keep data light
        const progress = Math.min(i / projectionHours, 1);
        // Ease-out curve for more natural recovery shape
        const eased = 1 - Math.pow(1 - progress, 2);
        const projLoad =
          Math.round((lastLoad + gap * eased) * 100) / 100;

        // Calculate the date string
        const lastDate = new Date(lastActual.time.replace(" ", "T") + ":00:00Z");
        const projDate = new Date(lastDate.getTime() + i * 3600_000);
        const y = projDate.getUTCFullYear();
        const mo = String(projDate.getUTCMonth() + 1).padStart(2, "0");
        const d = String(projDate.getUTCDate()).padStart(2, "0");
        const h = String(projDate.getUTCHours()).padStart(2, "0");
        projection.push({ time: `${y}-${mo}-${d} ${h}`, projectedLoad: projLoad });
      }
    }

    // Per-substation latest load
    let substations: { name: string; latestLoad: number | null }[] = [];
    if (latestRes.status === "fulfilled" && latestRes.value.ok) {
      const json = await latestRes.value.json();
      const latestBySubstation = new Map<string, number | null>();
      for (const r of json.results ?? []) {
        const name = r.subestacao as string;
        if (!latestBySubstation.has(name)) {
          latestBySubstation.set(
            name,
            r.energia != null
              ? Math.round(((r.energia as number) / 1000) * 100) / 100
              : null
          );
        }
      }
      substations = Array.from(latestBySubstation.entries()).map(
        ([name, latestLoad]) => ({ name, latestLoad })
      );
    }

    // Process per-substation daily data
    const perSubstation: Record<
      string,
      { actual: { time: string; totalLoad: number }[]; baseline: number }
    > = {};
    if (perSubResults.status === "fulfilled") {
      // Group raw records by substation
      const byStation = new Map<string, { day: string; energia: number }[]>();
      for (const r of perSubResults.value) {
        const name = (r["subestacao"] as string) ?? "";
        const dayKey =
          (r["day"] as string | null) ||
          (r["date_format(datahora,'yyyy-MM-dd')"] as string | null) ||
          "";
        const energia = (r["total_energia"] as number) ?? 0;
        if (!name || !dayKey) continue;
        const arr = byStation.get(name) ?? [];
        arr.push({ day: dayKey, energia });
        byStation.set(name, arr);
      }

      for (const [name, rows] of byStation) {
        rows.sort((a, b) => a.day.localeCompare(b.day));

        // Per-substation baseline: Jan 20-25 daily total average
        const baselineDays = rows.filter(
          (r) => r.day >= "2026-01-20" && r.day < "2026-01-26"
        );
        const bl =
          baselineDays.length > 0
            ? Math.round(
                (baselineDays.reduce((s, r) => s + r.energia / 1000, 0) /
                  baselineDays.length) *
                  100
              ) / 100
            : 0;

        perSubstation[name] = {
          actual: rows.map((r) => ({
            time: r.day,
            totalLoad: Math.round((r.energia / 1000) * 100) / 100,
          })),
          baseline: bl,
        };
      }
    }

    return {
      success: true,
      timestamp: new Date().toISOString(),
      source: "E-REDES — Diagrama de Carga de Subestações",
      substations,
      baseline: overallBaseline,
      actual,
      projection,
      perSubstation,
    };
  } finally {
    clearTimeout(timeout);
  }
}
