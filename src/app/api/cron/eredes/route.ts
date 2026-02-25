import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { eredesScheduledWork } from "@/db/schema";
import { verifyCronSecret } from "@/lib/cron-auth";
import {
  EREDES_BASE,
  EREDES_SCHEDULED_DATASET,
} from "@/lib/constants";
import { sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  if (process.env.FEATURE_EREDES_ENABLED !== "true") {
    return NextResponse.json({ success: true, skipped: true, message: "E-REDES data is temporarily disabled" });
  }

  try {
    const res = await fetch(
      `${EREDES_BASE}/catalog/datasets/${EREDES_SCHEDULED_DATASET}/records?limit=50&where=postalcode LIKE '24%'`,
      { cache: "no-store" }
    );

    let scheduledIngested = 0;

    if (res.ok) {
      const data = await res.json();
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
