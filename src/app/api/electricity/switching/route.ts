import { NextResponse } from "next/server";
import { db } from "@/db";
import { switchingOrders } from "@/db/schema";
import {
  computeConcelhoIndexes,
  computeDistrictSeries,
  toYearMonth,
  BASELINE_FROM,
  BASELINE_TO,
  type OrderRow,
} from "@/lib/switching-index";

// Monthly data — an hour of caching is generous.
export const revalidate = 3600;

export async function GET() {
  try {
    const records = await db
      .select({
        month: switchingOrders.month,
        concelho: switchingOrders.concelho,
        orderCount: switchingOrders.orderCount,
      })
      .from(switchingOrders);

    // The column is a date holding the first of the month; the API speaks YYYY-MM.
    const rows: OrderRow[] = records.map((r) => ({
      month: toYearMonth(r.month),
      concelho: r.concelho,
      orderCount: r.orderCount,
    }));

    const district = computeDistrictSeries(rows);
    const byConcelho = computeConcelhoIndexes(rows);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      source: "E-REDES — Ordens de serviço realizadas remotamente",
      baselineWindow: { from: BASELINE_FROM, to: BASELINE_TO },
      district,
      byConcelho,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
        district: { baseline: 0, series: [] },
        byConcelho: [],
      },
      { status: 500 }
    );
  }
}
