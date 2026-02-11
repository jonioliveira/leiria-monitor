import { NextResponse } from "next/server";

const EREDES_BASE = "https://e-redes.opendatasoft.com/api/explore/v2.1";

const OUTAGES_DATASET = "outages-auxiliar";
const SCHEDULED_DATASET = "network-scheduling-work";
const TRANSFORMERS_DATASET = "postos-transformacao-distribuicao";

// Leiria district municipalities
const LEIRIA_MUNICIPALITIES = [
  "Leiria",
  "Pombal",
  "Marinha Grande",
  "Alcobaça",
  "Batalha",
  "Porto de Mós",
  "Nazaré",
  "Caldas da Rainha",
  "Peniche",
  "Óbidos",
  "Bombarral",
  "Lourinhã",
  "Cadaval",
  "Ansião",
  "Alvaiázere",
  "Figueiró dos Vinhos",
  "Castanheira de Pêra",
  "Pedrógão Grande",
];

const municipalityFilter = LEIRIA_MUNICIPALITIES.map(
  (m) => `municipality = '${m}'`
).join(" OR ");

async function fetchTransformers() {
  try {
    // Get all transformers for Leiria municipality
    const res = await fetch(
      `${EREDES_BASE}/catalog/datasets/${TRANSFORMERS_DATASET}/records?` +
        `limit=0&` +
        `where=${encodeURIComponent("con_name = 'Leiria'")}`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const totalCount = data.total_count ?? 0;
    if (totalCount === 0) return null;

    // Get a sample for usage level distribution
    const detailRes = await fetch(
      `${EREDES_BASE}/catalog/datasets/${TRANSFORMERS_DATASET}/records?` +
        `limit=100&` +
        `where=${encodeURIComponent("con_name = 'Leiria'")}&` +
        `select=${encodeURIComponent("nivel_utilizacao, num_clientes, potencia_transformacao_kva")}`,
      { next: { revalidate: 86400 } }
    );
    if (!detailRes.ok) return { total_count: totalCount, total_clients: 0, total_capacity_kva: 0, usage_levels: [] };

    const detailData = await detailRes.json();
    const results = detailData.results ?? [];

    const usageLevels: Record<string, number> = {};
    let totalClients = 0;
    let totalCapacity = 0;

    for (const r of results) {
      const level = r.nivel_utilizacao ?? "Desconhecido";
      usageLevels[level] = (usageLevels[level] ?? 0) + 1;
      const clients = typeof r.num_clientes === "number" ? r.num_clientes : parseInt(r.num_clientes) || 0;
      totalClients += clients;
      totalCapacity += r.potencia_transformacao_kva ?? 0;
    }

    // Scale estimates to total count
    const scale = totalCount / Math.max(results.length, 1);

    return {
      total_count: totalCount,
      total_clients: Math.round(totalClients * scale),
      total_capacity_kva: Math.round(totalCapacity * scale),
      usage_levels: Object.entries(usageLevels)
        .map(([level, count]) => ({ level, count: Math.round(count * scale) }))
        .sort((a, b) => b.count - a.count),
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const [outagesRes, scheduledRes, transformers] =
      await Promise.allSettled([
        fetch(
          `${EREDES_BASE}/catalog/datasets/${OUTAGES_DATASET}/records?limit=100&where=${encodeURIComponent(municipalityFilter)}`,
          { next: { revalidate: 300 } }
        ),
        fetch(
          `${EREDES_BASE}/catalog/datasets/${SCHEDULED_DATASET}/records?limit=50&where=postalcode LIKE '24%'`,
          { next: { revalidate: 300 } }
        ),
        fetchTransformers(),
      ]);

    let outages = null;
    let scheduled = null;

    if (outagesRes.status === "fulfilled" && outagesRes.value.ok) {
      const data = await outagesRes.value.json();
      const records = (data.results ?? []).map((r: any) => ({
        municipality: r.municipality ?? r.municipio ?? "Desconhecido",
        count: r.count ?? r.total ?? 1,
        extraction_datetime:
          r.extractiondatetime ?? r.extraction_datetime ?? "",
      }));
      const totalCount = records.reduce(
        (sum: number, r: any) => sum + r.count,
        0
      );
      outages = {
        total_outage_count: totalCount,
        municipalities_affected: records.length,
        records,
        extraction_datetime: records[0]?.extraction_datetime ?? null,
      };
    }

    if (scheduledRes.status === "fulfilled" && scheduledRes.value.ok) {
      const data = await scheduledRes.value.json();
      scheduled = {
        total_records: data.total_count ?? 0,
        records: (data.results ?? []).map((r: any) => ({
          postal_code: r.postalcode,
          locality: r.locality ?? r.localidade,
          district: r.distrito ?? r.district,
          municipality: r.municipio ?? r.municipality,
          start_time: r.startdate ?? r.data_inicio,
          end_time: r.enddate ?? r.data_fim,
          reason: r.reason ?? r.motivo,
        })),
      };
    }

    // National outages for context
    let nationalOutages = null;
    try {
      const natRes = await fetch(
        `${EREDES_BASE}/catalog/datasets/${OUTAGES_DATASET}/records?limit=0`,
        { next: { revalidate: 300 } }
      );
      if (natRes.ok) {
        const natData = await natRes.json();
        nationalOutages = natData.total_count ?? 0;
      }
    } catch {}

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      source: "E-Redes Open Data Portal",
      source_url: "https://e-redes.opendatasoft.com",
      leiria: {
        active_outages: outages,
        scheduled_interruptions: scheduled,
      },
      national: {
        total_active_outages: nationalOutages,
      },
      transformers:
        transformers.status === "fulfilled" ? transformers.value : null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
