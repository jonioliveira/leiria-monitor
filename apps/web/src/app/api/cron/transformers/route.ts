import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { transformerCache } from "@/db/schema";
import { verifyCronSecret } from "@/lib/cron-auth";
import { fetchTransformerData } from "@/lib/transformer-fetcher";
import { sql } from "drizzle-orm";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const data = await fetchTransformerData();
    await db.delete(transformerCache).where(sql`1=1`);
    await db.insert(transformerCache).values({ data });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      total: data.total,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
