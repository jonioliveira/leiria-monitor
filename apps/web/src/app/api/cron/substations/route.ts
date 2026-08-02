import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { substationCache } from "@/db/schema";
import { verifyCronSecret } from "@/lib/cron-auth";
import { fetchSubstationData } from "@/lib/substation-fetcher";
import { sql } from "drizzle-orm";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const data = await fetchSubstationData();
    await db.delete(substationCache).where(sql`1=1`);
    await db.insert(substationCache).values({ data });

    const sub = data as { substations: unknown[]; actual: unknown[] };
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      substations: (sub.substations as unknown[]).length,
      actual_points: (sub.actual as unknown[]).length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
