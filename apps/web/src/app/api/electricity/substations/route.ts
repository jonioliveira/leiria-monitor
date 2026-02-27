import { after } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { substationCache } from "@/db/schema";
import { fetchSubstationData } from "@/lib/substation-fetcher";
import { desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

const STALE_AFTER_MS = 30 * 60 * 1000; // 30 minutes

async function refreshCache() {
  try {
    const data = await fetchSubstationData();
    await db.delete(substationCache).where(sql`1=1`);
    await db.insert(substationCache).values({ data });
  } catch {
    // Background refresh failure is silent — cached data keeps being served
  }
}

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(substationCache)
      .orderBy(desc(substationCache.fetchedAt))
      .limit(1);

    const cached = rows[0] ?? null;

    if (!cached) {
      // Cold start: no cache yet — fetch synchronously so we have something to return
      const data = await fetchSubstationData();
      await db.insert(substationCache).values({ data });
      return NextResponse.json(data);
    }

    // If data is stale, schedule a background refresh AFTER this response is sent.
    // The user gets the fast cached response now; the next request will get fresh data.
    const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
    if (ageMs > STALE_AFTER_MS) {
      after(refreshCache);
    }

    return NextResponse.json(cached.data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
        substations: [],
        baseline: 0,
        actual: [],
        projection: [],
        perSubstation: {},
      },
      { status: 500 }
    );
  }
}
