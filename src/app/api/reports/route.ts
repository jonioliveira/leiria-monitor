import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userReports } from "@/db/schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { classifyPriority } from "@/lib/classify-priority";
import { resolveParish } from "@/lib/parish-lookup";
import { detectHotspots } from "@/lib/hotspot-detection";

export const revalidate = 0;

// GET — fetch active reports from the last 7 days
export async function GET() {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const reports = await db
      .select()
      .from(userReports)
      .where(
        and(
          eq(userReports.resolved, false),
          gte(userReports.createdAt, sevenDaysAgo)
        )
      )
      .orderBy(
        sql`CASE ${userReports.priority} WHEN 'urgente' THEN 0 WHEN 'importante' THEN 1 ELSE 2 END`,
        desc(userReports.createdAt)
      );

    const mapped = reports.map((r) => ({
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

    const hotspots = detectHotspots(mapped);

    return NextResponse.json({
      success: true,
      total: mapped.length,
      reports: mapped,
      hotspots,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST — submit a new report
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { type, operator, description, street, lat, lng, imageUrl } = body;

    // Validate required fields
    if (!type || !lat || !lng) {
      return NextResponse.json(
        { success: false, error: "Campos obrigatórios: type, lat, lng" },
        { status: 400 }
      );
    }

    if (!["electricity", "telecom_mobile", "telecom_fixed", "water", "roads"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "type deve ser 'electricity', 'telecom_mobile', 'telecom_fixed', 'water' ou 'roads'" },
        { status: 400 }
      );
    }

    // Validate coordinates are roughly in Leiria district
    if (lat < 39.0 || lat > 40.2 || lng < -9.5 || lng > -8.0) {
      return NextResponse.json(
        { success: false, error: "Coordenadas fora do distrito de Leiria" },
        { status: 400 }
      );
    }

    const priority = await classifyPriority(description ?? null, type, street ?? null);

    // Resolve parish from coordinates
    let parish: string | null = null;
    try {
      const result = resolveParish(lat, lng);
      if (result) {
        parish = result.parish;
      }
    } catch {
      // Parish resolution is non-critical
    }

    const [inserted] = await db
      .insert(userReports)
      .values({
        type,
        operator: type.startsWith("telecom") ? operator ?? null : null,
        description: description?.slice(0, 500) ?? null,
        street: street?.slice(0, 200) ?? null,
        parish,
        lat,
        lng,
        priority,
        lastUpvotedAt: new Date(),
        imageUrl: imageUrl ?? null,
      })
      .returning({ id: userReports.id, priority: userReports.priority });

    return NextResponse.json({
      success: true,
      id: inserted.id,
      priority: inserted.priority,
      parish,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PATCH — upvote or resolve a report
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action } = body;

    if (!id || !action) {
      return NextResponse.json(
        { success: false, error: "Campos obrigatórios: id, action" },
        { status: 400 }
      );
    }

    if (action === "upvote") {
      const existing = await db
        .select({ upvotes: userReports.upvotes })
        .from(userReports)
        .where(eq(userReports.id, id))
        .limit(1);

      if (existing.length === 0) {
        return NextResponse.json(
          { success: false, error: "Reporte não encontrado" },
          { status: 404 }
        );
      }

      await db
        .update(userReports)
        .set({ upvotes: existing[0].upvotes + 1, lastUpvotedAt: new Date() })
        .where(eq(userReports.id, id));

      return NextResponse.json({ success: true, upvotes: existing[0].upvotes + 1 });
    }

    if (action === "resolve") {
      await db
        .update(userReports)
        .set({ resolved: true })
        .where(eq(userReports.id, id));

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: "action deve ser 'upvote' ou 'resolve'" },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
