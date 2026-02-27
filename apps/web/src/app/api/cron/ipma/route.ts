import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ipmaWarnings, ipmaForecasts } from "@/db/schema";
import { verifyCronSecret } from "@/lib/cron-auth";
import {
  IPMA_WARNINGS_URL,
  IPMA_FORECAST_URL,
  IPMA_LEIRIA_CITY_ID,
  IPMA_LEIRIA_AREA_ID,
  AWARENESS_TYPES,
  AWARENESS_LEVELS,
} from "@/lib/constants";
import { sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const [warningsRes, forecastRes] = await Promise.allSettled([
      fetch(IPMA_WARNINGS_URL, { cache: "no-store" }),
      fetch(`${IPMA_FORECAST_URL}/${IPMA_LEIRIA_CITY_ID}.json`, {
        cache: "no-store",
      }),
    ]);

    let warningsIngested = 0;
    let forecastsIngested = 0;

    // Process warnings
    if (warningsRes.status === "fulfilled" && warningsRes.value.ok) {
      const allWarnings = await warningsRes.value.json();
      const leiriaWarnings = (
        Array.isArray(allWarnings) ? allWarnings : []
      ).filter(
        (w: any) =>
          w.idAreaAviso === IPMA_LEIRIA_AREA_ID || w.idAreaAviso === "PTC"
      );

      // Delete old warnings and insert fresh
      await db.delete(ipmaWarnings).where(sql`1=1`);

      if (leiriaWarnings.length > 0) {
        await db.insert(ipmaWarnings).values(
          leiriaWarnings.map((w: any) => ({
            area: w.idAreaAviso ?? "unknown",
            type:
              AWARENESS_TYPES[w.awarenessTypeName] ??
              w.awarenessTypeName ??
              "unknown",
            level: w.awarenessLevelID ?? "green",
            levelColor:
              AWARENESS_LEVELS[w.awarenessLevelID]?.color ?? "#94a3b8",
            text: w.text ?? null,
            startTime: w.startTime ? new Date(w.startTime) : null,
            endTime: w.endTime ? new Date(w.endTime) : null,
          }))
        );
        warningsIngested = leiriaWarnings.length;
      }
    }

    // Process forecast
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
            precipProb:
              d.precipitaProb != null ? parseFloat(d.precipitaProb) : null,
            windDir: d.predWindDir ?? null,
            windClass: d.classWindSpeed != null ? parseInt(d.classWindSpeed) : null,
            weatherType: d.idWeatherType != null ? parseInt(d.idWeatherType) : null,
          }))
        );
        forecastsIngested = days.length;
      }
    }

    return NextResponse.json({
      success: true,
      ingested: { warnings: warningsIngested, forecasts: forecastsIngested },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
