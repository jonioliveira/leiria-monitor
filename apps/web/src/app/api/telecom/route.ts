import { after } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { telecomCache } from "@/db/schema";
import { fetchTelecomData } from "@/lib/telecom-fetcher";
import { desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

// How long cached data is considered fresh before a background refresh fires
const STALE_AFTER_MS = 15 * 60 * 1000; // 15 minutes

async function refreshCache() {
  try {
    const data = await fetchTelecomData();
    await db.transaction(async (tx) => {
      await tx.delete(telecomCache).where(sql`1=1`);
      await tx.insert(telecomCache).values({ data });
    });
  } catch {
    // Background refresh failure is silent — cached data keeps being served
  }
}

export async function GET() {
  try {
    // Read from DB — fast, no external calls
    const rows = await db
      .select()
      .from(telecomCache)
      .orderBy(desc(telecomCache.fetchedAt))
      .limit(1);

    const cached = rows[0] ?? null;

    if (!cached) {
      // Cold start: no cache yet — fetch synchronously so we have something to return
      const data = await fetchTelecomData();
      await db.insert(telecomCache).values({ data });
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
      { success: false, error: message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
