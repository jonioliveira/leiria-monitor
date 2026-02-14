import { NextResponse } from "next/server";
import {
  EREDES_BASE,
  EREDES_PTD_DATASET,
  LEIRIA_MUNICIPALITIES,
} from "@/lib/constants";

export const revalidate = 3600; // 1 hour — PTD data is static

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    // Build IN clause for Leiria municipalities
    const inClause = LEIRIA_MUNICIPALITIES.map((m) => `'${m}'`).join(",");
    const where = `con_name IN (${inClause})`;

    // Fetch first page to get total count
    const baseUrl = new URL(
      `${EREDES_BASE}/catalog/datasets/${EREDES_PTD_DATASET}/records`
    );
    baseUrl.searchParams.set("limit", "100");
    baseUrl.searchParams.set("where", where);
    baseUrl.searchParams.set(
      "select",
      "cod_instalacao,coordenadas_geo,potencia_transformacao_kva,nivel_utilizacao,num_clientes,con_name"
    );

    const firstRes = await fetch(baseUrl.toString(), {
      signal: controller.signal,
      next: { revalidate: 3600 },
    });
    if (!firstRes.ok) {
      throw new Error(`E-REDES API responded with ${firstRes.status}`);
    }
    const firstJson = await firstRes.json();
    const total = firstJson.total_count ?? 0;
    const allResults = [...(firstJson.results ?? [])];

    // Fetch remaining pages in parallel batches
    const offsets: number[] = [];
    for (let o = 100; o < total; o += 100) {
      offsets.push(o);
    }

    // Fetch in batches of 10 concurrent requests
    for (let i = 0; i < offsets.length; i += 10) {
      const batch = offsets.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map((offset) => {
          const pageUrl = new URL(baseUrl.toString());
          pageUrl.searchParams.set("offset", String(offset));
          return fetch(pageUrl.toString(), {
            signal: controller.signal,
            next: { revalidate: 3600 },
          });
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.ok) {
          const json = await r.value.json();
          allResults.push(...(json.results ?? []));
        }
      }
    }

    // Transform to lightweight markers
    const transformers = allResults
      .filter(
        (r: Record<string, unknown>) =>
          r.coordenadas_geo != null
      )
      .map((r: Record<string, unknown>) => {
        const geo = r.coordenadas_geo as { lat: number; lon: number };
        return {
          id: (r.cod_instalacao as string) ?? "",
          lat: geo.lat,
          lng: geo.lon,
          kva: (r.potencia_transformacao_kva as number) ?? 0,
          usage: (r.nivel_utilizacao as string) ?? "N/D",
          clients: parseInt((r.num_clientes as string) ?? "0", 10) || 0,
          municipality: (r.con_name as string) ?? "",
        };
      });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      total: transformers.length,
      transformers,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        error: message,
        total: 0,
        transformers: [],
      },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
