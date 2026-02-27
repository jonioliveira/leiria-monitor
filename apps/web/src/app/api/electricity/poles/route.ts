import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { btPoles } from "@/db/schema";
import { sql } from "drizzle-orm";

export const revalidate = 3600;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const minLat = parseFloat(searchParams.get("minLat") ?? "");
  const maxLat = parseFloat(searchParams.get("maxLat") ?? "");
  const minLng = parseFloat(searchParams.get("minLng") ?? "");
  const maxLng = parseFloat(searchParams.get("maxLng") ?? "");

  if ([minLat, maxLat, minLng, maxLng].some(isNaN)) {
    return NextResponse.json(
      { success: false, error: "Missing or invalid bbox params: minLat, maxLat, minLng, maxLng" },
      { status: 400 }
    );
  }

  try {
    const rows = await db
      .select({ id: btPoles.id, lat: btPoles.lat, lng: btPoles.lng })
      .from(btPoles)
      .where(
        sql`${btPoles.lat} BETWEEN ${minLat} AND ${maxLat} AND ${btPoles.lng} BETWEEN ${minLng} AND ${maxLng}`
      )
      .limit(10000);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      total: rows.length,
      poles: rows,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message, total: 0, poles: [] },
      { status: 500 }
    );
  }
}
