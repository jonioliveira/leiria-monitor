import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  eredesOutages,
  ipmaWarnings,
  procivOccurrences,
  procivWarnings,
  eredesScheduledWork,
} from "@/db/schema";
import { sql } from "drizzle-orm";
import { EREDES_BASE, EREDES_SUBSTATION_DATASET } from "@/lib/constants";

export const revalidate = 60;

export async function GET() {
  const eredesEnabled = process.env.FEATURE_EREDES_ENABLED === "true";

  try {
    // Fetch substation count from E-REDES API
    // Always fetch substation data — it's a direct API call, not gated by feature flag
    const substationPromise = (async () => {
      const url = new URL(
        `${EREDES_BASE}/catalog/datasets/${EREDES_SUBSTATION_DATASET}/records`
      );
      url.searchParams.set("limit", "100");
      url.searchParams.set(
        "where",
        "distrito='Leiria' AND datahora>='2026-02-02'"
      );
      url.searchParams.set(
        "select",
        "subestacao,max(energia) as max_energia"
      );
      url.searchParams.set("group_by", "subestacao");
      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 300 },
      });
      if (!res.ok) return { total: 0, active: 0 };
      const json = await res.json();
      const results = json.results ?? [];
      const total = results.length;
      const active = results.filter(
        (r: Record<string, unknown>) => (r.max_energia as number) > 0
      ).length;
      return { total, active };
    })().catch(() => ({ total: 0, active: 0 }));

    const [outages, warnings, occurrences, scheduledWork, populationWarnings, substationCount] =
      await Promise.all([
        eredesEnabled ? db.select().from(eredesOutages) : Promise.resolve([]),
        db.select().from(ipmaWarnings),
        db.select().from(procivOccurrences),
        eredesEnabled ? db.select().from(eredesScheduledWork) : Promise.resolve([]),
        db.select().from(procivWarnings),
        substationPromise,
      ]);

    const totalOutages = outages.reduce((sum, o) => sum + o.outageCount, 0);

    // Derive status levels
    let electricityStatus: "critical" | "warning" | "ok" | "unknown" = "unknown";
    if (eredesEnabled && outages.length > 0) {
      electricityStatus = totalOutages > 5 ? "critical" : totalOutages > 0 ? "warning" : "ok";
    } else if (substationCount.total > 0) {
      electricityStatus = substationCount.active < substationCount.total ? "warning" : "ok";
    }

    let weatherStatus: "critical" | "warning" | "ok" | "unknown" = "unknown";
    if (warnings.length >= 0) {
      const hasRed = warnings.some((w) => w.level === "red");
      const hasOrange = warnings.some((w) => w.level === "orange");
      weatherStatus = hasRed ? "critical" : hasOrange ? "warning" : "ok";
    }

    let occurrencesStatus: "critical" | "warning" | "ok" | "unknown" = "unknown";
    if (occurrences.length === 0) {
      occurrencesStatus = "ok";
    } else if (occurrences.length <= 3) {
      occurrencesStatus = "warning";
    } else {
      occurrencesStatus = "critical";
    }

    // Fetch Copernicus EMS data
    const copernicusResult = await fetch(
      "https://mapping.emergency.copernicus.eu/activations/api/activations/EMSR861/",
      { signal: AbortSignal.timeout(10000) }
    ).then((r) => r.json()).catch(() => null);

    let copernicus: { status: string; products: number; aois: number; active: boolean } = {
      status: "unknown",
      products: 0,
      aois: 0,
      active: false,
    };
    if (copernicusResult) {
      const raw = copernicusResult;
      const isActive = !raw.closed;
      copernicus = {
        status: raw.code ? (isActive ? "warning" : "ok") : "unknown",
        products: raw.n_products ?? 0,
        aois: raw.n_aois ?? 0,
        active: isActive,
      };
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        electricity: {
          status: electricityStatus,
          totalOutages,
          municipalitiesAffected: outages.filter((o) => o.outageCount > 0).length,
          substationsTotal: substationCount.total,
          substationsActive: substationCount.active,
        },
        weather: {
          status: weatherStatus,
          activeWarnings: warnings.filter(
            (w) => w.level !== "green"
          ).length,
        },
        occurrences: {
          status: occurrencesStatus,
          activeCount: occurrences.length,
        },
        scheduledWork: {
          count: scheduledWork.length,
        },
        copernicus,
      },
      recentWarnings: warnings
        .filter((w) => w.level !== "green")
        .slice(0, 3)
        .map((w) => ({
          type: w.type,
          level: w.level,
          levelColor: w.levelColor,
          text: w.text,
        })),
      populationWarnings: populationWarnings.map((w) => ({
        id: w.id,
        title: w.title,
        summary: w.summary,
        detailUrl: w.detailUrl,
        fetchedAt: w.fetchedAt.toISOString(),
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
