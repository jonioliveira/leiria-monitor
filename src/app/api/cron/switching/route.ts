import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { switchingOrders } from "@/db/schema";
import { verifyCronSecret } from "@/lib/cron-auth";
import { fetchSwitchingOrders } from "@/lib/switching-fetcher";

export const maxDuration = 60;

const BATCH = 500;

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const rows = await fetchSwitchingOrders();

    if (rows.length === 0) {
      console.error("[cron/switching] fetch returned no rows — leaving table untouched");
      return NextResponse.json(
        {
          success: false,
          error: "E-REDES returned no rows; existing data left in place",
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    // Upsert rather than delete-and-replace, so a partial fetch can never
    // empty the table. Retained history is deliberate: E-REDES has already
    // deleted one dataset this project depended on.
    const values = rows.map((r) => ({
      month: `${r.month}-01`,
      concelho: r.concelho,
      orderCount: r.orderCount,
      fetchedAt: new Date(),
    }));

    for (let i = 0; i < values.length; i += BATCH) {
      await db
        .insert(switchingOrders)
        .values(values.slice(i, i + BATCH))
        .onConflictDoUpdate({
          target: [switchingOrders.month, switchingOrders.concelho],
          set: {
            orderCount: sql`excluded.order_count`,
            fetchedAt: sql`excluded.fetched_at`,
          },
        });
    }

    const months = new Set(rows.map((r) => r.month));
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      detail: {
        rows: rows.length,
        months: months.size,
        latestMonth: [...months].sort().at(-1) ?? null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[cron/switching] ingestion failed:", message);
    return NextResponse.json(
      { success: false, error: message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
