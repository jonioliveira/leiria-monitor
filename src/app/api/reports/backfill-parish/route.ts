import { NextResponse } from "next/server";
import { db } from "@/db";
import { userReports } from "@/db/schema";
import { isNull, eq } from "drizzle-orm";
import { resolveParish } from "@/lib/parish-lookup";

export const revalidate = 0;

export async function POST() {
  try {
    const rows = await db
      .select({ id: userReports.id, lat: userReports.lat, lng: userReports.lng })
      .from(userReports)
      .where(isNull(userReports.parish));

    let updated = 0;
    for (const row of rows) {
      const result = resolveParish(row.lat, row.lng);
      if (result) {
        await db
          .update(userReports)
          .set({ parish: result.parish })
          .where(eq(userReports.id, row.id));
        updated++;
      }
    }

    return NextResponse.json({
      success: true,
      total: rows.length,
      updated,
      skipped: rows.length - updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
