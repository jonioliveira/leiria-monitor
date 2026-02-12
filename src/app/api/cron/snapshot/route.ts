import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  eredesOutages,
  eredesScheduledWork,
  ipmaWarnings,
  procivOccurrences,
  recoverySnapshots,
} from "@/db/schema";
import { verifyCronSecret } from "@/lib/cron-auth";
import {
  calculateRecoveryScore,
  deriveElectricityScore,
  deriveOccurrencesScore,
  deriveWeatherScore,
  deriveScheduledWorkBonus,
} from "@/lib/recovery-score";
import { eq, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    // Read latest data from all tables
    const outages = await db.select().from(eredesOutages);
    const warnings = await db.select().from(ipmaWarnings);
    const occurrences = await db.select().from(procivOccurrences);
    const scheduledWork = await db.select().from(eredesScheduledWork);

    const totalOutages = outages.reduce((sum, o) => sum + o.outageCount, 0);
    const activeOccurrences = occurrences.length;

    const electricityScore = deriveElectricityScore(totalOutages);
    const weatherScore = deriveWeatherScore(
      warnings.map((w) => ({ level: w.level }))
    );
    const occurrencesScore = deriveOccurrencesScore(activeOccurrences);
    const scheduledWorkBonus = deriveScheduledWorkBonus(scheduledWork.length);

    const overallScore = calculateRecoveryScore({
      electricityScore,
      occurrencesScore,
      weatherScore,
      scheduledWorkBonus,
    });

    const today = new Date().toISOString().split("T")[0];

    const metadata = {
      totalOutages,
      activeOccurrences,
      activeWarnings: warnings.length,
      scheduledWorkCount: scheduledWork.length,
      electricityScore,
      weatherScore,
      occurrencesScore,
      scheduledWorkBonus,
    };

    // Upsert by date
    const existing = await db
      .select({ id: recoverySnapshots.id })
      .from(recoverySnapshots)
      .where(eq(recoverySnapshots.date, today))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(recoverySnapshots)
        .set({
          electricityScore,
          weatherScore,
          occurrencesScore,
          overallScore,
          metadata,
        })
        .where(eq(recoverySnapshots.date, today));
    } else {
      await db.insert(recoverySnapshots).values({
        date: today,
        electricityScore,
        weatherScore,
        occurrencesScore,
        overallScore,
        metadata,
      });
    }

    return NextResponse.json({
      success: true,
      score: overallScore,
      breakdown: metadata,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
