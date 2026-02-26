import { after } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { transformerCache } from "@/db/schema";
import { fetchTransformerData } from "@/lib/transformer-fetcher";
import { desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

async function refreshCache() {
  try {
    const data = await fetchTransformerData();
    await db.delete(transformerCache).where(sql`1=1`);
    await db.insert(transformerCache).values({ data });
  } catch {
    // Background refresh failure is silent — cached data keeps being served
  }
}

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(transformerCache)
      .orderBy(desc(transformerCache.fetchedAt))
      .limit(1);

    const cached = rows[0] ?? null;

    if (!cached) {
      // Cold start: no cache yet — fetch synchronously
      const data = await fetchTransformerData();
      await db.insert(transformerCache).values({ data });
      return NextResponse.json(data);
    }

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
        timestamp: new Date().toISOString(),
        error: message,
        total: 0,
        transformers: [],
      },
      { status: 500 }
    );
  }
}
