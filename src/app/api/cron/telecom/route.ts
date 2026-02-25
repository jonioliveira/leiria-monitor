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

    const meo = data.meo_availability as { success: boolean; concelhos: unknown[]; leiria_district: unknown[] };
    const nos = data.nos_availability as { success: boolean; concelhos: unknown[]; leiria_district: unknown[] };
    const vdf = data.vodafone_availability as { success: boolean; concelhos: unknown[]; leiria_district: unknown[] };
    const ops = data.operators as { name: string; reachable: boolean; response_time_ms: number | null }[];

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      scrapers: {
        meo: {
          ok: meo.success,
          concelhos: meo.concelhos.length,
          leiria_district: meo.leiria_district.length,
        },
        nos: {
          ok: nos?.success ?? false,
          concelhos: nos?.concelhos.length ?? 0,
          leiria_district: nos?.leiria_district.length ?? 0,
        },
        vodafone: {
          ok: vdf?.success ?? false,
          concelhos: vdf?.concelhos.length ?? 0,
          leiria_district: vdf?.leiria_district.length ?? 0,
        },
      },
      operator_endpoints: ops.map((o) => ({
        name: o.name,
        reachable: o.reachable,
        response_time_ms: o.response_time_ms,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
