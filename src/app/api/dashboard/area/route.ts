import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userReports, telecomCache, switchingOrders } from "@/db/schema";
import { eq, and, gte, inArray, desc } from "drizzle-orm";
import { getParishesByConcelho } from "@/lib/parish-lookup";
import {
  EREDES_BASE,
  EREDES_PTD_DATASET,
  MUNICIPALITY_COORDS,
} from "@/lib/constants";
import { computeConcelhoIndexes, toYearMonth, type OrderRow } from "@/lib/switching-index";

export const revalidate = 60;

/**
 * E-REDES matches `con_name` case-sensitively against the properly-cased
 * municipality name ('Leiria' returns 1020 rows, 'LEIRIA' returns 0), while
 * callers may send any casing. Resolve to the canonical spelling — which also
 * keeps the caller-supplied value out of the ODSQL string.
 */
function canonicalMunicipality(name: string): string | null {
  const target = name.toUpperCase();
  return (
    Object.keys(MUNICIPALITY_COORDS).find((m) => m.toUpperCase() === target) ??
    null
  );
}

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
    const canonical = canonicalMunicipality(concelho);
    if (!parish && canonical) {
      try {
        const url = new URL(
          `${EREDES_BASE}/catalog/datasets/${EREDES_PTD_DATASET}/records`
        );
        url.searchParams.set("limit", "0");
        // The dataset has no `municipio` field — that query returned
        // "Unknown field: municipio" and the error was swallowed below, so
        // every council page reported 0 transformers.
        url.searchParams.set("where", `con_name='${canonical}'`);
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
        } else {
          console.warn(
            `[dashboard/area] transformer count failed: HTTP ${res.status} for con_name='${canonical}'`
          );
        }
      } catch (error) {
        console.warn(
          `[dashboard/area] transformer count threw for con_name='${canonical}':`,
          error
        );
      }
    }

    // Per-concelho recovery index. Uses the canonical municipality spelling so a
    // mis-cased query param cannot silently match zero rows.
    let switching: {
      latestIndex: number | null;
      latestMonth: string | null;
      baseline: number;
    } | null = null;

    if (canonical) {
      try {
        const records = await db
          .select({
            month: switchingOrders.month,
            concelho: switchingOrders.concelho,
            orderCount: switchingOrders.orderCount,
          })
          .from(switchingOrders)
          .where(eq(switchingOrders.concelho, canonical));

        const rows: OrderRow[] = records.map((r) => ({
          month: toYearMonth(r.month),
          concelho: r.concelho,
          orderCount: r.orderCount,
        }));

        const computed = computeConcelhoIndexes(rows)[0];
        if (computed) {
          switching = {
            latestIndex: computed.latestIndex,
            latestMonth: computed.latestMonth,
            baseline: computed.baseline,
          };
        }
      } catch (error) {
        console.warn(`[dashboard/area] switching index failed for '${canonical}':`, error);
      }
    }

    // Telecom coverage from cache — match by concelho name (case-insensitive)
    let telecom: {
      meo: { rede_fixa_pct: number | null; rede_movel_pct: number | null; rede_fixa_previsao: string; rede_movel_previsao: string } | null;
      nos: { rede_fixa_pct: number | null; rede_movel_pct: number | null } | null;
      vodafone: { rede_fixa_pct: number | null; rede_movel_pct: number | null; rede_fixa_previsao: string; rede_movel_previsao: string } | null;
    } | null = null;
    try {
      const cacheRows = await db.select().from(telecomCache).orderBy(desc(telecomCache.fetchedAt)).limit(1);
      if (cacheRows.length > 0) {
        const cached = cacheRows[0].data as Record<string, unknown>;
        const norm = concelho.toLowerCase();
        const find = (list: unknown[]) =>
          (list as { concelho: string }[]).find((c) => c.concelho.toLowerCase() === norm) ?? null;

        const meoRaw = find((cached.meo_availability as { concelhos: unknown[] })?.concelhos ?? []) as
          { rede_fixa_pct: number | null; rede_movel_pct: number | null; rede_fixa_previsao?: string; rede_movel_previsao?: string } | null;
        const nosRaw = find((cached.nos_availability as { concelhos: unknown[] })?.concelhos ?? []) as
          { rede_fixa_pct: number | null; rede_movel_pct: number | null } | null;
        const vdfRaw = find((cached.vodafone_availability as { concelhos: unknown[] })?.concelhos ?? []) as
          { rede_fixa_pct: number | null; rede_movel_pct: number | null; rede_fixa_previsao?: string; rede_movel_previsao?: string } | null;

        telecom = {
          meo: meoRaw ? { rede_fixa_pct: meoRaw.rede_fixa_pct, rede_movel_pct: meoRaw.rede_movel_pct, rede_fixa_previsao: meoRaw.rede_fixa_previsao ?? "", rede_movel_previsao: meoRaw.rede_movel_previsao ?? "" } : null,
          nos: nosRaw ? { rede_fixa_pct: nosRaw.rede_fixa_pct, rede_movel_pct: nosRaw.rede_movel_pct } : null,
          vodafone: vdfRaw ? { rede_fixa_pct: vdfRaw.rede_fixa_pct, rede_movel_pct: vdfRaw.rede_movel_pct, rede_fixa_previsao: vdfRaw.rede_fixa_previsao ?? "", rede_movel_previsao: vdfRaw.rede_movel_previsao ?? "" } : null,
        };
      }
    } catch {
      // Non-critical
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
      telecom,
      switching,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
