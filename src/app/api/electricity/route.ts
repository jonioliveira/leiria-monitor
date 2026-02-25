import { NextResponse } from "next/server";
import { db } from "@/db";
import { eredesOutages, eredesScheduledWork } from "@/db/schema";

export const revalidate = 60;

export async function GET() {
  try {
    const [outages, scheduledWork] = await Promise.all([
      db.select().from(eredesOutages),
      db.select().from(eredesScheduledWork),
    ]);

    const totalOutages = outages.reduce((sum, o) => sum + o.outageCount, 0);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      source: "E-Redes Open Data Portal",
      source_url: "https://e-redes.opendatasoft.com",
      leiria: {
        active_outages: {
          total_outage_count: totalOutages,
          municipalities_affected: outages.filter((o) => o.outageCount > 0)
            .length,
          records: outages.map((o) => ({
            municipality: o.municipality,
            count: o.outageCount,
            extraction_datetime: o.extractionDatetime,
          })),
          extraction_datetime: outages[0]?.extractionDatetime ?? null,
        },
        scheduled_interruptions: {
          total_records: scheduledWork.length,
          records: scheduledWork.map((s) => ({
            postal_code: s.postalCode,
            locality: s.locality,
            district: s.district,
            municipality: s.municipality,
            start_time: s.startTime,
            end_time: s.endTime,
            reason: s.reason,
          })),
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
