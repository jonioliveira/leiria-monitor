import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { btPoles } from "@/db/schema";
import { verifyCronSecret } from "@/lib/cron-auth";
import {
  EREDES_BASE,
  EREDES_POLES_DATASET,
  LEIRIA_CENTER,
  LEIRIA_RADIUS_KM,
} from "@/lib/constants";
import { sql } from "drizzle-orm";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const where = `within_distance(geo_point_2d, geom'POINT(${LEIRIA_CENTER.lng} ${LEIRIA_CENTER.lat})', ${LEIRIA_RADIUS_KM}km)`;

    // Use the export endpoint to bypass the 10K offset limit
    const exportUrl = new URL(
      `${EREDES_BASE}/catalog/datasets/${EREDES_POLES_DATASET}/exports/json`
    );
    exportUrl.searchParams.set("where", where);
    exportUrl.searchParams.set("select", "geo_point_2d");

    const res = await fetch(exportUrl.toString(), { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`E-REDES API responded with ${res.status}`);
    }

    const allResults: Array<Record<string, unknown>> = await res.json();

    // Extract lat/lng from results
    const poles = allResults
      .filter((r) => r.geo_point_2d != null)
      .map((r) => {
        const geo = r.geo_point_2d as { lat: number; lon: number };
        return { lat: geo.lat, lng: geo.lon };
      });

    // Delete all existing rows and batch insert
    await db.delete(btPoles).where(sql`1=1`);

    for (let i = 0; i < poles.length; i += 500) {
      const batch = poles.slice(i, i + 500);
      await db.insert(btPoles).values(batch);
    }

    return NextResponse.json({
      success: true,
      ingested: poles.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
