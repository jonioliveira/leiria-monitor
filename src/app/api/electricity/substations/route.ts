import { NextResponse } from "next/server";
import { EREDES_BASE, EREDES_SUBSTATION_DATASET } from "@/lib/constants";

export const revalidate = 300; // 5 minutes
export const maxDuration = 60;

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

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);

  try {
    // Fetch Jan 20 – Feb 3: covers baseline (20-25), storm (28), recovery (29+)
    const hourlyUrl = new URL(
      `${EREDES_BASE}/catalog/datasets/${EREDES_SUBSTATION_DATASET}/records`
    );
    hourlyUrl.searchParams.set("limit", "100");
    hourlyUrl.searchParams.set(
      "where",
      "distrito='Leiria' AND datahora>='2026-01-20' AND datahora<='2026-02-03'"
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

    // Per-substation latest readings (last day available)
    const latestUrl = new URL(
      `${EREDES_BASE}/catalog/datasets/${EREDES_SUBSTATION_DATASET}/records`
    );
    latestUrl.searchParams.set("limit", "100");
    latestUrl.searchParams.set(
      "where",
      "distrito='Leiria' AND datahora>='2026-02-02'"
    );
    latestUrl.searchParams.set("select", "subestacao,datahora,energia");
    latestUrl.searchParams.set("order_by", "datahora DESC");

    // Per-substation hourly data for individual charts
    const perSubHourlyUrl = new URL(
      `${EREDES_BASE}/catalog/datasets/${EREDES_SUBSTATION_DATASET}/records`
    );
    perSubHourlyUrl.searchParams.set("limit", "100");
    perSubHourlyUrl.searchParams.set(
      "where",
      "distrito='Leiria' AND datahora>='2026-01-20' AND datahora<='2026-02-03'"
    );
    perSubHourlyUrl.searchParams.set(
      "select",
      "subestacao,date_format(datahora,'yyyy-MM-dd HH') as hour,sum(energia) as total_energia"
    );
    perSubHourlyUrl.searchParams.set(
      "group_by",
      "subestacao,date_format(datahora,'yyyy-MM-dd HH')"
    );
    perSubHourlyUrl.searchParams.set("order_by", "subestacao,hour");

    const [hourlyResults, latestRes, perSubResults] = await Promise.allSettled([
      fetchAllPages(hourlyUrl, controller.signal),
      fetch(latestUrl.toString(), {
        signal: controller.signal,
        next: { revalidate: 300 },
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

    // Actual data: full period Jan 20 - Feb 3
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

    // Process per-substation hourly data
    const perSubstation: Record<
      string,
      { actual: { time: string; totalLoad: number }[]; baseline: number }
    > = {};
    if (perSubResults.status === "fulfilled") {
      // Group raw records by substation
      const byStation = new Map<string, { hour: string; energia: number }[]>();
      for (const r of perSubResults.value) {
        const name = (r["subestacao"] as string) ?? "";
        const hourKey =
          (r["hour"] as string | null) ||
          (r["date_format(datahora,'yyyy-MM-dd HH')"] as string | null) ||
          "";
        const energia = (r["total_energia"] as number) ?? 0;
        if (!name || !hourKey) continue;
        const arr = byStation.get(name) ?? [];
        arr.push({ hour: hourKey, energia });
        byStation.set(name, arr);
      }

      for (const [name, rows] of byStation) {
        rows.sort((a, b) => a.hour.localeCompare(b.hour));

        // Per-substation baseline: Jan 20-25 average
        const blByHour = new Map<number, number[]>();
        for (const r of rows) {
          if (r.hour >= "2026-01-20" && r.hour < "2026-01-26") {
            const hod = parseInt(r.hour.slice(-2), 10);
            const arr = blByHour.get(hod) ?? [];
            arr.push(r.energia / 1000);
            blByHour.set(hod, arr);
          }
        }
        let bl = 0;
        if (blByHour.size > 0) {
          const avgValues = [...blByHour.values()].map(
            (vals) => vals.reduce((a, b) => a + b, 0) / vals.length
          );
          bl =
            Math.round(
              (avgValues.reduce((a, b) => a + b, 0) / avgValues.length) * 100
            ) / 100;
        }

        perSubstation[name] = {
          actual: rows.map((r) => ({
            time: r.hour,
            totalLoad: Math.round((r.energia / 1000) * 100) / 100,
          })),
          baseline: bl,
        };
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      source: "E-REDES — Diagrama de Carga de Subestações",
      substations,
      baseline: overallBaseline,
      actual,
      projection,
      perSubstation,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        error: message,
        substations: [],
        baseline: 0,
        actual: [],
        projection: [],
        perSubstation: {},
      },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
