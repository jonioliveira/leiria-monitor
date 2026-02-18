import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userReports } from "@/db/schema";
import { eq, and, gte, inArray, desc } from "drizzle-orm";
import { getParishesByConcelho } from "@/lib/parish-lookup";
import {
  EREDES_BASE,
  EREDES_PTD_DATASET,
} from "@/lib/constants";

export const revalidate = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const concelho = searchParams.get("concelho");
  const parish = searchParams.get("parish");

  if (!concelho) {
    return NextResponse.json(
      { success: false, error: "Query param 'concelho' is required" },
      { status: 400 }
    );
  }

  try {
    const allParishes = getParishesByConcelho(concelho);

    if (allParishes.length === 0) {
      return NextResponse.json(
        { success: false, error: `Concelho '${concelho}' not found in GeoJSON` },
        { status: 404 }
      );
    }

    // Determine which parishes to filter by
    const targetParishes = parish ? [parish] : allParishes;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Fetch user reports for the target parishes
    const reports = await db
      .select()
      .from(userReports)
      .where(
        and(
          eq(userReports.resolved, false),
          gte(userReports.createdAt, sevenDaysAgo),
          inArray(userReports.parish, targetParishes)
        )
      )
      .orderBy(desc(userReports.createdAt));

    // Count by type
    const byType: Record<string, number> = {};
    const parishesWithReports = new Set<string>();
    for (const r of reports) {
      byType[r.type] = (byType[r.type] ?? 0) + 1;
      if (r.parish) parishesWithReports.add(r.parish);
    }

    // Recent reports (last 10)
    const recentReports = reports.slice(0, 10).map((r) => ({
      id: r.id,
      type: r.type,
      operator: r.operator,
      description: r.description,
      street: r.street,
      parish: r.parish,
      lat: r.lat,
      lng: r.lng,
      upvotes: r.upvotes,
      priority: r.priority,
      lastUpvotedAt: r.lastUpvotedAt?.toISOString() ?? null,
      imageUrl: r.imageUrl,
      createdAt: r.createdAt.toISOString(),
    }));

    // Fetch transformer data for this concelho (concelho-level only)
    let transformers: { total: number; avgUsage: string | null } = { total: 0, avgUsage: null };
    if (!parish) {
      try {
        const url = new URL(
          `${EREDES_BASE}/catalog/datasets/${EREDES_PTD_DATASET}/records`
        );
        url.searchParams.set("limit", "0");
        url.searchParams.set(
          "where",
          `municipio='${concelho.toUpperCase()}'`
        );
        const res = await fetch(url.toString(), {
          signal: AbortSignal.timeout(5000),
          next: { revalidate: 300 },
        });
        if (res.ok) {
          const json = await res.json();
          transformers = {
            total: json.total_count ?? 0,
            avgUsage: null,
          };
        }
      } catch {
        // Non-critical
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      concelho,
      parish: parish ?? null,
      reports: {
        total: reports.length,
        byType,
        parishes: Array.from(parishesWithReports).sort(),
      },
      recentReports,
      transformers: parish ? null : transformers,
      parishes: allParishes,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
