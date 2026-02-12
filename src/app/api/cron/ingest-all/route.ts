import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  ipmaWarnings,
  ipmaForecasts,
  eredesOutages,
  eredesScheduledWork,
  procivOccurrences,
  procivWarnings,
  recoverySnapshots,
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
  EREDES_OUTAGES_DATASET,
  EREDES_SCHEDULED_DATASET,
  LEIRIA_MUNICIPALITIES,
  LEIRIA_MUNICIPALITIES_UPPER,
  ANEPC_FEATURE_SERVER,
} from "@/lib/constants";
import {
  calculateRecoveryScore,
  deriveElectricityScore,
  deriveOccurrencesScore,
  deriveWeatherScore,
  deriveScheduledWorkBonus,
} from "@/lib/recovery-score";
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

    results.ipma = { success: true, detail: { warnings: warningsIngested, forecasts: forecastsIngested } };
  } catch (error: any) {
    results.ipma = { success: false, error: error.message };
  }

  // 2) E-REDES — outages + scheduled work
  try {
    const municipalityFilter = LEIRIA_MUNICIPALITIES.map((m) => `municipality = '${m}'`).join(" OR ");
    const [outagesRes, scheduledRes] = await Promise.allSettled([
      fetch(
        `${EREDES_BASE}/catalog/datasets/${EREDES_OUTAGES_DATASET}/records?limit=100&where=${encodeURIComponent(municipalityFilter)}`,
        { cache: "no-store" }
      ),
      fetch(
        `${EREDES_BASE}/catalog/datasets/${EREDES_SCHEDULED_DATASET}/records?limit=50&where=postalcode LIKE '24%'`,
        { cache: "no-store" }
      ),
    ]);

    let outagesIngested = 0;
    let scheduledIngested = 0;

    if (outagesRes.status === "fulfilled" && outagesRes.value.ok) {
      const data = await outagesRes.value.json();
      const records = data.results ?? [];
      await db.delete(eredesOutages).where(sql`1=1`);
      if (records.length > 0) {
        await db.insert(eredesOutages).values(
          records.map((r: any) => ({
            municipality: r.municipality ?? r.municipio ?? "Desconhecido",
            outageCount: r.count ?? r.total ?? 1,
            extractionDatetime: r.extractiondatetime ?? r.extraction_datetime ?? null,
          }))
        );
        outagesIngested = records.length;
      }
    }

    if (scheduledRes.status === "fulfilled" && scheduledRes.value.ok) {
      const data = await scheduledRes.value.json();
      const records = data.results ?? [];
      await db.delete(eredesScheduledWork).where(sql`1=1`);
      if (records.length > 0) {
        await db.insert(eredesScheduledWork).values(
          records.map((r: any) => ({
            postalCode: r.postalcode ?? null,
            locality: r.locality ?? r.localidade ?? null,
            district: r.distrito ?? r.district ?? null,
            municipality: r.municipio ?? r.municipality ?? null,
            startTime: r.startdate ?? r.data_inicio ?? null,
            endTime: r.enddate ?? r.data_fim ?? null,
            reason: r.reason ?? r.motivo ?? null,
          }))
        );
        scheduledIngested = records.length;
      }
    }

    results.eredes = { success: true, detail: { outages: outagesIngested, scheduled: scheduledIngested } };
  } catch (error: any) {
    results.eredes = { success: false, error: error.message };
  }

  // 3) ProCiv — occurrences
  try {
    const concelhoFilter = LEIRIA_MUNICIPALITIES_UPPER.map((m) => `Concelho='${m}'`).join(" OR ");
    const url = new URL(ANEPC_FEATURE_SERVER);
    url.searchParams.set("where", concelhoFilter);
    url.searchParams.set("outFields", "*");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("f", "json");
    url.searchParams.set("resultRecordCount", "200");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url.toString(), { signal: controller.signal, cache: "no-store" });
    clearTimeout(timeout);

    let ingested = 0;
    if (res.ok) {
      const data = await res.json();
      const features = data.features ?? [];

      for (const feature of features) {
        const attrs = feature.attributes ?? {};
        const geom = feature.geometry ?? {};
        const externalId = String(attrs.OBJECTID ?? attrs.FID ?? "");
        if (!externalId) continue;

        const existing = await db
          .select({ id: procivOccurrences.id })
          .from(procivOccurrences)
          .where(eq(procivOccurrences.externalId, externalId))
          .limit(1);

        const record = {
          externalId,
          nature: attrs.Natureza ?? attrs.NaturezaEvento ?? null,
          state: attrs.EstadoOcorrencia ?? attrs.Estado ?? null,
          municipality: attrs.Concelho ?? null,
          lat: geom.y ?? null,
          lng: geom.x ?? null,
          startTime: attrs.DataOcorrencia ? new Date(attrs.DataOcorrencia) : null,
          numMeans: attrs.NumeroMeiosTerrestresEnvolvidos ?? attrs.NumMeios ?? null,
          numOperatives: attrs.NumeroOperacionaisEnvolvidos ?? attrs.NumOperacionais ?? null,
          numAerialMeans: attrs.NumeroMeiosAereosEnvolvidos ?? null,
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
          .map((f: any) => String(f.attributes?.OBJECTID ?? f.attributes?.FID ?? ""))
          .filter(Boolean);
        await db
          .delete(procivOccurrences)
          .where(sql`external_id NOT IN (${sql.join(currentIds.map((id: string) => sql`${id}`), sql`, `)})`);
      }
    }

    results.prociv = { success: true, detail: { ingested } };
  } catch (error: any) {
    results.prociv = { success: false, error: error.message };
  }

  // 4) ProCiv — population warnings (HTML scrape)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch("https://www.prociv.gov.pt/pt/home/avisos-a-populacao/", {
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

    if (res.ok) {
      const html = await res.text();

      const modalRegex =
        /<p\s+class="titulo">(.*?)<\/p>\s*<p\s+class="titulo-informativo">.*?<\/p>\s*<p\s+class="resumo">(.*?)<\/p>[\s\S]*?<a[^>]+href="([^"]*)"[^>]*>Saiba mais<\/a>/g;
      let match;
      while ((match = modalRegex.exec(html)) !== null) {
        const title = decodeHtmlEntities(match[1].trim());
        const summary = decodeHtmlEntities(match[2].trim());
        const detailUrl = match[3] || null;
        if (title && summary) scraped.push({ title, summary, detailUrl });
      }

      if (scraped.length === 0) {
        const bannerRegex =
          /<p\s+class="titulo-emergencia">(.*?)<\/p>[\s\S]*?<a[^>]+class="button-alerta"[^>]+href="([^"]*)"[^>]*>/g;
        while ((match = bannerRegex.exec(html)) !== null) {
          const rawTitle = decodeHtmlEntities(match[1].trim());
          if (rawTitle && !rawTitle.includes("&nbsp;")) {
            scraped.push({ title: rawTitle, summary: rawTitle, detailUrl: match[2] || null });
          }
        }
      }

      await db.delete(procivWarnings);
      for (const w of scraped) {
        await db.insert(procivWarnings).values({
          title: w.title,
          summary: w.summary,
          detailUrl: w.detailUrl ? `https://www.prociv.gov.pt${w.detailUrl}` : null,
          fetchedAt: new Date(),
        });
      }
    }

    results.procivWarnings = { success: true, detail: { ingested: scraped.length } };
  } catch (error: any) {
    results.procivWarnings = { success: false, error: error.message };
  }

  // 5) Recovery snapshot
  try {
    const outages = await db.select().from(eredesOutages);
    const warnings = await db.select().from(ipmaWarnings);
    const occurrences = await db.select().from(procivOccurrences);
    const scheduledWork = await db.select().from(eredesScheduledWork);

    const totalOutages = outages.reduce((sum, o) => sum + o.outageCount, 0);
    const activeOccurrences = occurrences.length;

    const electricityScore = deriveElectricityScore(totalOutages);
    const weatherScore = deriveWeatherScore(warnings.map((w) => ({ level: w.level })));
    const occurrencesScore = deriveOccurrencesScore(activeOccurrences);
    const scheduledWorkBonus = deriveScheduledWorkBonus(scheduledWork.length);

    const overallScore = calculateRecoveryScore({
      electricityScore,
      occurrencesScore,
      weatherScore,
      scheduledWorkBonus,
    });

    const today = new Date().toISOString().split("T")[0];
    const metadata = {
      totalOutages,
      activeOccurrences,
      activeWarnings: warnings.length,
      scheduledWorkCount: scheduledWork.length,
      electricityScore,
      weatherScore,
      occurrencesScore,
      scheduledWorkBonus,
    };

    const existing = await db
      .select({ id: recoverySnapshots.id })
      .from(recoverySnapshots)
      .where(eq(recoverySnapshots.date, today))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(recoverySnapshots)
        .set({ electricityScore, weatherScore, occurrencesScore, overallScore, metadata })
        .where(eq(recoverySnapshots.date, today));
    } else {
      await db.insert(recoverySnapshots).values({
        date: today,
        electricityScore,
        weatherScore,
        occurrencesScore,
        overallScore,
        metadata,
      });
    }

    results.snapshot = { success: true, detail: { score: overallScore } };
  } catch (error: any) {
    results.snapshot = { success: false, error: error.message };
  }

  return NextResponse.json({
    success: true,
    results,
    timestamp: new Date().toISOString(),
  });
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#xE0;/g, "à")
    .replace(/&#xE7;/g, "ç")
    .replace(/&#xE3;/g, "ã")
    .replace(/&#xE9;/g, "é")
    .replace(/&#xEA;/g, "ê")
    .replace(/&#xED;/g, "í")
    .replace(/&#xF3;/g, "ó")
    .replace(/&#xF4;/g, "ô")
    .replace(/&#xFA;/g, "ú")
    .replace(/&#xA;/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .trim();
}
