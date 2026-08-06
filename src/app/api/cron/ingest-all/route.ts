import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  ipmaWarnings,
  ipmaForecasts,
  eredesScheduledWork,
  procivOccurrences,
  procivWarnings,
  antennas,
} from "@/db/schema";
import { verifyCronSecret } from "@/lib/cron-auth";
import {
  IPMA_WARNINGS_URL,
  IPMA_FORECAST_URL,
  IPMA_LEIRIA_CITY_ID,
  IPMA_LEIRIA_AREA_ID,
  AWARENESS_TYPES,
  AWARENESS_LEVELS,
  EREDES_BASE,
  EREDES_SCHEDULED_DATASET,
  LEIRIA_MUNICIPALITIES,
  OCORRENCIAS360_API,
} from "@/lib/constants";
import { eq, sql } from "drizzle-orm";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const results: Record<string, { success: boolean; detail?: any; error?: string }> = {};

  // 1) IPMA — warnings + forecast
  try {
    const [warningsRes, forecastRes] = await Promise.allSettled([
      fetch(IPMA_WARNINGS_URL, { cache: "no-store" }),
      fetch(`${IPMA_FORECAST_URL}/${IPMA_LEIRIA_CITY_ID}.json`, { cache: "no-store" }),
    ]);

    let warningsIngested = 0;
    let forecastsIngested = 0;
    const ipmaErrors: string[] = [];

    if (warningsRes.status === "rejected") {
      ipmaErrors.push(`warnings: ${warningsRes.reason}`);
    } else if (!warningsRes.value.ok) {
      ipmaErrors.push(`warnings: HTTP ${warningsRes.value.status}`);
    }

    if (forecastRes.status === "rejected") {
      ipmaErrors.push(`forecast: ${forecastRes.reason}`);
    } else if (!forecastRes.value.ok) {
      ipmaErrors.push(`forecast: HTTP ${forecastRes.value.status}`);
    }

    if (warningsRes.status === "fulfilled" && warningsRes.value.ok) {
      const allWarnings = await warningsRes.value.json();
      const leiriaWarnings = (Array.isArray(allWarnings) ? allWarnings : []).filter(
        (w: any) => w.idAreaAviso === IPMA_LEIRIA_AREA_ID || w.idAreaAviso === "PTC"
      );
      await db.delete(ipmaWarnings).where(sql`1=1`);
      if (leiriaWarnings.length > 0) {
        await db.insert(ipmaWarnings).values(
          leiriaWarnings.map((w: any) => ({
            area: w.idAreaAviso ?? "unknown",
            type: AWARENESS_TYPES[w.awarenessTypeName] ?? w.awarenessTypeName ?? "unknown",
            level: w.awarenessLevelID ?? "green",
            levelColor: AWARENESS_LEVELS[w.awarenessLevelID]?.color ?? "#94a3b8",
            text: w.text ?? null,
            startTime: w.startTime ? new Date(w.startTime) : null,
            endTime: w.endTime ? new Date(w.endTime) : null,
          }))
        );
        warningsIngested = leiriaWarnings.length;
      }
    }

    if (forecastRes.status === "fulfilled" && forecastRes.value.ok) {
      const forecastData = await forecastRes.value.json();
      const days = (forecastData.data ?? []).slice(0, 5);
      await db.delete(ipmaForecasts).where(sql`1=1`);
      if (days.length > 0) {
        await db.insert(ipmaForecasts).values(
          days.map((d: any) => ({
            forecastDate: d.forecastDate,
            tempMin: d.tMin != null ? parseFloat(d.tMin) : null,
            tempMax: d.tMax != null ? parseFloat(d.tMax) : null,
            precipProb: d.precipitaProb != null ? parseFloat(d.precipitaProb) : null,
            windDir: d.predWindDir ?? null,
            windClass: d.classWindSpeed != null ? parseInt(d.classWindSpeed) : null,
            weatherType: d.idWeatherType != null ? parseInt(d.idWeatherType) : null,
          }))
        );
        forecastsIngested = days.length;
      }
    }

    results.ipma = {
      success: ipmaErrors.length === 0,
      error: ipmaErrors.length > 0 ? ipmaErrors.join("; ") : undefined,
      detail: { warnings: warningsIngested, forecasts: forecastsIngested },
    };
  } catch (error: any) {
    results.ipma = { success: false, error: error.message };
  }

  // 2) E-REDES — scheduled work
  try {
    // Filter by municipality rather than postal prefix. Leiria district spans
    // 24xx, 25xx and 31xx/32xx codes, so `zipcode LIKE '24%'` silently skipped
    // Pombal, Ansião, Alvaiázere, Caldas da Rainha and Peniche.
    const inClause = LEIRIA_MUNICIPALITIES.map((m) => `'${m}'`).join(",");
    const url = new URL(
      `${EREDES_BASE}/catalog/datasets/${EREDES_SCHEDULED_DATASET}/records`
    );
    url.searchParams.set("limit", "100");
    url.searchParams.set("where", `municipality IN (${inClause})`);

    const res = await fetch(url.toString(), { cache: "no-store" });

    let scheduledIngested = 0;

    if (res.ok) {
      const data = await res.json();
      const records = data.results ?? [];
      // A successful fetch returning nothing is legitimate here — it means no
      // work is currently scheduled — so the table is replaced either way.
      await db.delete(eredesScheduledWork).where(sql`1=1`);
      if (records.length > 0) {
        await db.insert(eredesScheduledWork).values(
          records.map((r: any) => ({
            postalCode: r.zipcode ?? null,
            locality: r.parish ?? null,
            district: "Leiria",
            municipality: r.municipality ?? null,
            startTime: r.startdatetime ?? null,
            endTime: r.enddatetime ?? null,
            // The dataset no longer carries a free-text motive; the only
            // signal left is the scheduled-interruption flag.
            reason: r.interrupcao_programada === 1 ? "Interrupção programada" : null,
          }))
        );
        scheduledIngested = records.length;
      }
    }

    results.eredes = res.ok
      ? { success: true, detail: { scheduled: scheduledIngested } }
      : {
          success: false,
          error: `HTTP ${res.status} from ${EREDES_SCHEDULED_DATASET} — the dataset's field names change; verify the 'where' clause`,
        };
  } catch (error: any) {
    results.eredes = { success: false, error: error.message };
  }

  // 3) ProCiv — occurrences (via ocorrencias360)
  try {
    const leiriaSet = new Set(LEIRIA_MUNICIPALITIES.map((m) => m));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    const res = await fetch(OCORRENCIAS360_API, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    let ingested = 0;
    if (res.ok) {
      const data = await res.json();
      const hourlyData = data.dataByHour ?? {};
      const latestHour = Object.keys(hourlyData).sort().pop();
      if (!latestHour) throw new Error("No hourly data available");

      const allFeatures: any[] = hourlyData[latestHour] ?? [];
      const features = allFeatures.filter(
        (f: any) => leiriaSet.has(f.properties?.Concelho)
      );

      for (const feature of features) {
        const props = feature.properties ?? {};
        const coords = feature.geometry?.coordinates ?? [];
        const externalId = String(props.ID_oc ?? "");
        if (!externalId) continue;

        const existing = await db
          .select({ id: procivOccurrences.id })
          .from(procivOccurrences)
          .where(eq(procivOccurrences.externalId, externalId))
          .limit(1);

        const record = {
          externalId,
          nature: props.Natureza ?? null,
          state: props.EstadoOcorrencia ?? null,
          municipality: props.Concelho ?? null,
          lat: coords[1] ?? null,
          lng: coords[0] ?? null,
          startTime: props.DataInicioOcorrencia ? new Date(props.DataInicioOcorrencia) : null,
          numMeans: props.MeiosTerrestres ?? null,
          numOperatives: props.Operacionais ?? null,
          numAerialMeans: props.MeiosAereos ?? null,
          fetchedAt: new Date(),
        };

        if (existing.length > 0) {
          await db.update(procivOccurrences).set(record).where(eq(procivOccurrences.externalId, externalId));
        } else {
          await db.insert(procivOccurrences).values(record);
        }
        ingested++;
      }

      if (features.length > 0) {
        const currentIds = features
          .map((f: any) => String(f.properties?.ID_oc ?? ""))
          .filter(Boolean);
        await db
          .delete(procivOccurrences)
          .where(sql`external_id NOT IN (${sql.join(currentIds.map((id: string) => sql`${id}`), sql`, `)})`);
      } else {
        // No active occurrences in Leiria — clear the table
        await db.delete(procivOccurrences).where(sql`1=1`);
      }
    }

    results.prociv = res.ok
      ? { success: true, detail: { ingested } }
      : { success: false, error: `HTTP ${res.status} from ${OCORRENCIAS360_API}` };
  } catch (error: any) {
    results.prociv = { success: false, error: error.message };
  }

  // 4) ProCiv — population warnings (HTML scrape)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    // The old /pt/home/avisos-a-populacao/ path now 301s to the homepage;
    // the warnings live here.
    const res = await fetch("https://prociv.gov.pt/pt/avisos-a-populacao/", {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);

    const scraped: { title: string; summary: string; detailUrl: string | null }[] = [];
    let cardsFound = 0;

    if (res.ok) {
      const html = await res.text();

      // Each warning is a `box-avisos` card. Splitting on the opening div
      // isolates one card per chunk, so the first match of each field within
      // a chunk belongs to that card.
      const cards = html.split('<div class="box-avisos">').slice(1);
      cardsFound = cards.length;

      for (const card of cards) {
        // "Ativo" = currently in force, "Arquivo" = historical. Only the
        // former should ever be surfaced as a live warning.
        const tipo = /<div class="Tipo">([^<]*)<\/div>/.exec(card)?.[1] ?? "";
        if (!/ativo/i.test(tipo)) continue;

        const title = cleanText(
          /<p class="h3-style[^"]*">([\s\S]*?)<\/p>/.exec(card)?.[1] ?? ""
        );
        const summary = cleanText(
          /<div class="card-noticias-ellipsis-noimage">([\s\S]*?)<\/div>/.exec(card)?.[1] ?? ""
        );
        const href = /window\.location\.href='([^']+)'/.exec(card)?.[1] ?? null;

        if (title && summary) {
          scraped.push({ title, summary, detailUrl: href });
        }
      }

      // Replace the table whenever the parse succeeded — including when there
      // are zero active warnings, which legitimately clears stale rows. Only
      // skip when no cards matched at all, which means the markup changed and
      // an unconditional delete would empty the table for good.
      if (cardsFound > 0) {
        await db.delete(procivWarnings);
        for (const w of scraped) {
          await db.insert(procivWarnings).values({
            title: w.title,
            summary: w.summary,
            detailUrl: w.detailUrl ? `https://prociv.gov.pt${w.detailUrl}` : null,
            fetchedAt: new Date(),
          });
        }
      }
    }

    if (!res.ok) {
      results.procivWarnings = { success: false, error: `HTTP ${res.status}` };
    } else if (cardsFound === 0) {
      results.procivWarnings = {
        success: false,
        error:
          "fetched OK but found no 'box-avisos' cards — the page markup changed and the scrape patterns need updating",
      };
    } else {
      results.procivWarnings = {
        success: true,
        detail: { active: scraped.length, cardsSeen: cardsFound },
      };
    }
  } catch (error: any) {
    results.procivWarnings = { success: false, error: error.message };
  }

  // 5) Antennas — fetch GeoJSON from GitHub and store in DB
  try {
    const GEOJSON_BASE = "https://raw.githubusercontent.com/avataranedotas/antenas_mobile/main";
    const OPERATOR_FILES = [
      { file: "meo.geojson", name: "MEO" },
      { file: "nos.geojson", name: "NOS" },
      { file: "vdf.geojson", name: "Vodafone" },
      { file: "digi.geojson", name: "DIGI" },
    ];
    const BBOX = { latMin: 39.15, latMax: 40.05, lngMin: -9.45, lngMax: -8.1 };

    const geoResults = await Promise.allSettled(
      OPERATOR_FILES.map(async (op) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const res = await fetch(`${GEOJSON_BASE}/${op.file}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timeout);
        if (!res.ok) return { features: [] as any[], operator: op.name };
        const data = await res.json();
        return { features: data.features ?? [], operator: op.name };
      })
    );

    const grouped = new Map<string, {
      lat: number; lng: number; operators: Set<string>;
      owner: string | null; type: string; technologies: Set<string>;
    }>();

    for (const result of geoResults) {
      if (result.status !== "fulfilled") continue;
      const { features, operator: fileOp } = result.value;
      for (const f of features) {
        if (f.geometry?.type !== "Point") continue;
        const [fLng, fLat] = f.geometry.coordinates;
        if (fLat < BBOX.latMin || fLat > BBOX.latMax || fLng < BBOX.lngMin || fLng > BBOX.lngMax) continue;
        const key = `${fLat.toFixed(6)},${fLng.toFixed(6)}`;
        const props = f.properties ?? {};
        const ops = props.operator
          ? props.operator.split(/[;,/]/).map((s: string) =>
              s.trim().replace(/\s*P$/i, "")
                .replace(/^vodafone$/i, "Vodafone").replace(/^meo$/i, "MEO")
                .replace(/^nos$/i, "NOS").replace(/^digi$/i, "DIGI")
            ).filter(Boolean)
          : [fileOp];
        const techs: string[] = [];
        if (props["communication:gsm"] === "yes" || props["frequency"]?.includes("900") || props["frequency"]?.includes("1800")) techs.push("2G");
        if (props["communication:umts"] === "yes" || props["frequency"]?.includes("2100")) techs.push("3G");
        if (props["communication:lte"] === "yes" || props["frequency"]?.includes("800") || props["frequency"]?.includes("2600")) techs.push("4G");
        if (props["communication:nr"] === "yes" || props["frequency"]?.includes("3500") || props["frequency"]?.includes("700")) techs.push("5G");
        if (techs.length === 0 && props["communication:mobile_phone"] === "yes") techs.push("Móvel");
        const owner = props.owner ?? null;
        const manMade = props.man_made ?? "other";
        const type = manMade === "mast" ? "mast" : manMade === "tower" ? "tower" : "other";
        if (grouped.has(key)) {
          const existing = grouped.get(key)!;
          ops.forEach((o: string) => existing.operators.add(o));
          techs.forEach((t: string) => existing.technologies.add(t));
          if (owner && !existing.owner) existing.owner = owner;
        } else {
          grouped.set(key, { lat: fLat, lng: fLng, operators: new Set(ops), owner, type, technologies: new Set(techs) });
        }
      }
    }

    const rows = Array.from(grouped.values()).map((g) => ({
      lat: g.lat, lng: g.lng, operators: Array.from(g.operators),
      owner: g.owner, type: g.type, technologies: Array.from(g.technologies),
    }));

    const failedOperators = geoResults.filter((r) => r.status === "rejected").length;

    // Only wipe the table when there is replacement data — an upstream outage
    // would otherwise leave the map with no antennas at all until the next run.
    if (rows.length > 0) {
      await db.delete(antennas).where(sql`1=1`);
      const BATCH = 500;
      for (let i = 0; i < rows.length; i += BATCH) {
        await db.insert(antennas).values(rows.slice(i, i + BATCH));
      }
    }

    results.antennas =
      rows.length === 0
        ? {
            success: false,
            error: `no antenna features fetched (${failedOperators}/${OPERATOR_FILES.length} operator sources failed)`,
          }
        : { success: true, detail: { ingested: rows.length, failedOperators } };
  } catch (error: any) {
    results.antennas = { success: false, error: error.message };
  }

  const failedSteps = Object.entries(results)
    .filter(([, r]) => !r.success)
    .map(([step]) => step);

  if (failedSteps.length > 0) {
    // Log and return non-2xx so the failure is visible in the Vercel cron
    // dashboard and in runtime error tracking. Every step used to report
    // success even when the upstream returned 404/400, so stale data looked
    // identical to healthy data from the outside.
    console.error(
      `[cron/ingest-all] ${failedSteps.length}/${Object.keys(results).length} steps failed: ${failedSteps.join(", ")}`,
      JSON.stringify(results)
    );
  }

  return NextResponse.json(
    {
      success: failedSteps.length === 0,
      failedSteps,
      results,
      timestamp: new Date().toISOString(),
    },
    { status: failedSteps.length > 0 ? 500 : 200 }
  );
}

function decodeHtmlEntities(text: string): string {
  return text
    // Decode numeric entities generically. The previous hand-written list
    // covered nine accented characters and silently left the rest — á, õ, â
    // and others on the ProCiv pages — as raw "&#xE1;" in the stored text.
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/** Strip tags, decode entities and collapse whitespace from scraped HTML. */
function cleanText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}
