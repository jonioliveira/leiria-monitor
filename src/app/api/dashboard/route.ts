import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  eredesOutages,
  ipmaWarnings,
  procivOccurrences,
  procivWarnings,
  recoverySnapshots,
  eredesScheduledWork,
} from "@/db/schema";
import { desc, sql } from "drizzle-orm";

export const revalidate = 60;

export async function GET() {
  try {
    const [snapshot, outages, warnings, occurrences, scheduledWork, populationWarnings] =
      await Promise.all([
        db
          .select()
          .from(recoverySnapshots)
          .orderBy(desc(recoverySnapshots.date))
          .limit(1),
        db.select().from(eredesOutages),
        db.select().from(ipmaWarnings),
        db.select().from(procivOccurrences),
        db.select().from(eredesScheduledWork),
        db.select().from(procivWarnings),
      ]);

    const latestSnapshot = snapshot[0] ?? null;
    const totalOutages = outages.reduce((sum, o) => sum + o.outageCount, 0);

    // Derive status levels
    let electricityStatus: "critical" | "warning" | "ok" | "unknown" = "unknown";
    if (outages.length > 0) {
      electricityStatus = totalOutages > 5 ? "critical" : totalOutages > 0 ? "warning" : "ok";
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

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      recovery: latestSnapshot
        ? {
            score: latestSnapshot.overallScore,
            date: latestSnapshot.date,
            breakdown: latestSnapshot.metadata,
          }
        : null,
      summary: {
        electricity: {
          status: electricityStatus,
          totalOutages,
          municipalitiesAffected: outages.filter((o) => o.outageCount > 0).length,
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
