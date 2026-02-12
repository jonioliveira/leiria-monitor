import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userReports } from "@/db/schema";
import { eq, desc, and, gte } from "drizzle-orm";

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
      .orderBy(desc(userReports.createdAt));

    return NextResponse.json({
      success: true,
      total: reports.length,
      reports: reports.map((r) => ({
        id: r.id,
        type: r.type,
        operator: r.operator,
        description: r.description,
        street: r.street,
        lat: r.lat,
        lng: r.lng,
        upvotes: r.upvotes,
        createdAt: r.createdAt.toISOString(),
      })),
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

    const { type, operator, description, street, lat, lng } = body;

    // Validate required fields
    if (!type || !lat || !lng) {
      return NextResponse.json(
        { success: false, error: "Campos obrigatórios: type, lat, lng" },
        { status: 400 }
      );
    }

    if (!["electricity", "telecom"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "type deve ser 'electricity' ou 'telecom'" },
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

    const [inserted] = await db
      .insert(userReports)
      .values({
        type,
        operator: type === "telecom" ? operator ?? null : null,
        description: description?.slice(0, 500) ?? null,
        street: street?.slice(0, 200) ?? null,
        lat,
        lng,
      })
      .returning({ id: userReports.id });

    return NextResponse.json({
      success: true,
      id: inserted.id,
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
        .set({ upvotes: existing[0].upvotes + 1 })
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
