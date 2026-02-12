import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { eredesOutages, eredesScheduledWork } from "@/db/schema";
import { verifyCronSecret } from "@/lib/cron-auth";
import {
  EREDES_BASE,
  EREDES_OUTAGES_DATASET,
  EREDES_SCHEDULED_DATASET,
  LEIRIA_MUNICIPALITIES,
} from "@/lib/constants";
import { sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  if (process.env.FEATURE_EREDES_ENABLED !== "true") {
    return NextResponse.json({ success: true, skipped: true, message: "E-REDES data is temporarily disabled" });
  }

  try {
    const municipalityFilter = LEIRIA_MUNICIPALITIES.map(
      (m) => `municipality = '${m}'`
    ).join(" OR ");

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

    // Process outages
    if (outagesRes.status === "fulfilled" && outagesRes.value.ok) {
      const data = await outagesRes.value.json();
      const records = data.results ?? [];

      // Delete stale and insert fresh
      await db.delete(eredesOutages).where(sql`1=1`);

      if (records.length > 0) {
        await db.insert(eredesOutages).values(
          records.map((r: any) => ({
            municipality:
              r.municipality ?? r.municipio ?? "Desconhecido",
            outageCount: r.count ?? r.total ?? 1,
            extractionDatetime:
              r.extractiondatetime ?? r.extraction_datetime ?? null,
          }))
        );
        outagesIngested = records.length;
      }
    }

    // Process scheduled work
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

    return NextResponse.json({
      success: true,
      outages: outagesIngested,
      scheduled_work: scheduledIngested,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
