import { NextResponse } from "next/server";
import { db } from "@/db";
import { antennas } from "@/db/schema";

const OPERATOR_COLORS: Record<string, string> = {
  MEO: "#00a3e0",
  NOS: "#ff6600",
  Vodafone: "#e60000",
  DIGI: "#003087",
};

export async function GET() {
  try {
    const rows = await db.select().from(antennas);

    const result = rows.map((r) => ({
      id: r.id,
      lat: r.lat,
      lng: r.lng,
      operators: r.operators,
      owner: r.owner,
      type: r.type,
      technologies: r.technologies,
    }));

    // Build summary
    const operatorCounts = new Map<string, number>();
    const ownerCounts = new Map<string, number>();

    for (const a of result) {
      for (const op of a.operators) {
        operatorCounts.set(op, (operatorCounts.get(op) ?? 0) + 1);
      }
      const ownerKey = a.owner ?? "Desconhecido";
      ownerCounts.set(ownerKey, (ownerCounts.get(ownerKey) ?? 0) + 1);
    }

    const by_operator = Array.from(operatorCounts.entries())
      .map(([operator, count]) => ({
        operator,
        count,
        color: OPERATOR_COLORS[operator] ?? "#8b5cf6",
      }))
      .sort((a, b) => b.count - a.count);

    const by_owner = Array.from(ownerCounts.entries())
      .map(([owner, count]) => ({ owner, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      antennas: result,
      summary: {
        total: result.length,
        by_operator,
        by_owner,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
