import { NextResponse } from "next/server";
import { db } from "@/db";
import { procivOccurrences } from "@/db/schema";

export const revalidate = 60;

export async function GET() {
  try {
    const occurrences = await db.select().from(procivOccurrences);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      source: "ANEPC — Autoridade Nacional de Emergência e Proteção Civil",
      total: occurrences.length,
      occurrences: occurrences.map((o) => ({
        id: o.id,
        externalId: o.externalId,
        nature: o.nature,
        state: o.state,
        municipality: o.municipality,
        coordinates:
          o.lat != null && o.lng != null
            ? { lat: o.lat, lng: o.lng }
            : null,
        startTime: o.startTime?.toISOString() ?? null,
        numMeans: o.numMeans,
        numOperatives: o.numOperatives,
        numAerialMeans: o.numAerialMeans,
        fetchedAt: o.fetchedAt.toISOString(),
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
