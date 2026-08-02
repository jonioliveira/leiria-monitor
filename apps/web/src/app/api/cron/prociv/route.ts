import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { procivOccurrences } from "@/db/schema";
import { verifyCronSecret } from "@/lib/cron-auth";
import { LEIRIA_MUNICIPALITIES, OCORRENCIAS360_API } from "@/lib/constants";
import { eq, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const leiriaSet = new Set(LEIRIA_MUNICIPALITIES.map((m) => m));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    const res = await fetch(OCORRENCIAS360_API, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `ocorrencias360 responded ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const hourlyData = data.dataByHour ?? {};
    const latestHour = Object.keys(hourlyData).sort().pop();
    if (!latestHour) {
      return NextResponse.json(
        { success: false, error: "No hourly data available" },
        { status: 502 }
      );
    }

    const allFeatures: any[] = hourlyData[latestHour] ?? [];
    const features = allFeatures.filter(
      (f: any) => leiriaSet.has(f.properties?.Concelho)
    );

    let ingested = 0;

    for (const feature of features) {
      const props = feature.properties ?? {};
      const coords = feature.geometry?.coordinates ?? [];
      const externalId = String(props.ID_oc ?? "");
      if (!externalId) continue;

      const existing = await db
        .select({ id: procivOccurrences.id })
        .from(procivOccurrences)
        .where(eq(procivOccurrences.externalId, externalId))
        .limit(1);

      const record = {
        externalId,
        nature: props.Natureza ?? null,
        state: props.EstadoOcorrencia ?? null,
        municipality: props.Concelho ?? null,
        lat: coords[1] ?? null,
        lng: coords[0] ?? null,
        startTime: props.DataInicioOcorrencia ? new Date(props.DataInicioOcorrencia) : null,
        numMeans: props.MeiosTerrestres ?? null,
        numOperatives: props.Operacionais ?? null,
        numAerialMeans: props.MeiosAereos ?? null,
        fetchedAt: new Date(),
      };

      if (existing.length > 0) {
        await db
          .update(procivOccurrences)
          .set(record)
          .where(eq(procivOccurrences.externalId, externalId));
      } else {
        await db.insert(procivOccurrences).values(record);
      }
      ingested++;
    }

    if (features.length > 0) {
      const currentIds = features
        .map((f: any) => String(f.properties?.ID_oc ?? ""))
        .filter(Boolean);
      await db
        .delete(procivOccurrences)
        .where(sql`external_id NOT IN (${sql.join(currentIds.map((id: string) => sql`${id}`), sql`, `)})`);
    } else {
      await db.delete(procivOccurrences).where(sql`1=1`);
    }

    return NextResponse.json({
      success: true,
      ingested,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
