import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { procivOccurrences } from "@/db/schema";
import { verifyCronSecret } from "@/lib/cron-auth";
import { ANEPC_FEATURE_SERVER, LEIRIA_MUNICIPALITIES_UPPER } from "@/lib/constants";
import { eq, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const concelhoFilter = LEIRIA_MUNICIPALITIES_UPPER.map(
      (m) => `Concelho='${m}'`
    ).join(" OR ");

    const url = new URL(ANEPC_FEATURE_SERVER);
    url.searchParams.set("where", concelhoFilter);
    url.searchParams.set("outFields", "*");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("f", "json");
    url.searchParams.set("resultRecordCount", "200");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `ANEPC responded ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const features = data.features ?? [];

    let ingested = 0;

    for (const feature of features) {
      const attrs = feature.attributes ?? {};
      const geom = feature.geometry ?? {};
      const externalId = String(attrs.OBJECTID ?? attrs.FID ?? "");

      if (!externalId) continue;

      // Upsert by external ID
      const existing = await db
        .select({ id: procivOccurrences.id })
        .from(procivOccurrences)
        .where(eq(procivOccurrences.externalId, externalId))
        .limit(1);

      const record = {
        externalId,
        nature: attrs.Natureza ?? attrs.NaturezaEvento ?? null,
        state: attrs.EstadoOcorrencia ?? attrs.Estado ?? null,
        municipality: attrs.Concelho ?? null,
        lat: geom.y ?? null,
        lng: geom.x ?? null,
        startTime: attrs.DataOcorrencia
          ? new Date(attrs.DataOcorrencia)
          : null,
        numMeans: attrs.NumeroMeiosTerrestresEnvolvidos ?? attrs.NumMeios ?? null,
        numOperatives: attrs.NumeroOperacionaisEnvolvidos ?? attrs.NumOperacionais ?? null,
        numAerialMeans: attrs.NumeroMeiosAereosEnvolvidos ?? null,
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

    // Clean up old occurrences that weren't in this fetch (resolved)
    if (features.length > 0) {
      const currentIds = features
        .map((f: any) => String(f.attributes?.OBJECTID ?? f.attributes?.FID ?? ""))
        .filter(Boolean);

      await db
        .delete(procivOccurrences)
        .where(sql`external_id NOT IN (${sql.join(currentIds.map((id: string) => sql`${id}`), sql`, `)})`);
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
