import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { telecomCache } from "@/db/schema";
import { verifyCronSecret } from "@/lib/cron-auth";
import { fetchTelecomData } from "@/lib/telecom-fetcher";
import { sql } from "drizzle-orm";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const data = await fetchTelecomData();

    // Replace cache with fresh data (single row)
    await db.delete(telecomCache).where(sql`1=1`);
    await db.insert(telecomCache).values({ data });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      operators_checked: (data.operators as unknown[]).length,
      meo_concelhos: (data.meo_availability as { concelhos: unknown[] }).concelhos.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
