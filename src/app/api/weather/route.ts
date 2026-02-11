import { NextResponse } from "next/server";

export const runtime = "edge";

// IPMA API endpoints
const IPMA_WARNINGS = "https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json";
const IPMA_FORECAST = "https://api.ipma.pt/open-data/forecast/meteorology/cities/daily";

// Leiria city code in IPMA
const LEIRIA_CITY_ID = 1100900; // Leiria

// District ID for Leiria in warnings
const LEIRIA_DISTRICT_ID = "LEI";

// Awareness type mapping
const AWARENESS_TYPES: Record<string, string> = {
  "1": "Vento",
  "2": "Chuva",
  "3": "Neve",
  "4": "Trovoada",
  "5": "Nevoeiro",
  "6": "Frio extremo",
  "7": "Calor extremo",
  "8": "Ondas costeiras",
  "9": "Incêndios",
  "10": "Precipitação",
  "11": "Agitação marítima",
};

// Awareness level mapping
const AWARENESS_LEVELS: Record<string, { label: string; color: string }> = {
  green: { label: "Sem Aviso", color: "#10b981" },
  yellow: { label: "Amarelo", color: "#f59e0b" },
  orange: { label: "Laranja", color: "#f97316" },
  red: { label: "Vermelho", color: "#ef4444" },
};

export async function GET() {
  try {
    const [warningsRes, forecastRes] = await Promise.allSettled([
      fetch(IPMA_WARNINGS, { next: { revalidate: 600 } }),
      fetch(`${IPMA_FORECAST}/${LEIRIA_CITY_ID}.json`, {
        next: { revalidate: 1800 },
      }),
    ]);

    let warnings: any[] = [];
    let forecast: any[] = [];

    // Parse warnings
    if (warningsRes.status === "fulfilled" && warningsRes.value.ok) {
      const allWarnings = await warningsRes.value.json();

      // Filter for Leiria district (or national)
      warnings = (Array.isArray(allWarnings) ? allWarnings : [])
        .filter(
          (w: any) =>
            w.idAreaAviso === LEIRIA_DISTRICT_ID ||
            w.idAreaAviso === "PTC" // National level
        )
        .map((w: any) => ({
          area: w.idAreaAviso,
          type: AWARENESS_TYPES[w.awarenessTypeName] ?? w.awarenessTypeName,
          level: w.awarenessLevelID ?? "green",
          level_label:
            AWARENESS_LEVELS[w.awarenessLevelID]?.label ?? w.awarenessLevelID,
          level_color:
            AWARENESS_LEVELS[w.awarenessLevelID]?.color ?? "#94a3b8",
          text: w.text,
          start: w.startTime,
          end: w.endTime,
        }));
    }

    // Parse forecast
    if (forecastRes.status === "fulfilled" && forecastRes.value.ok) {
      const forecastData = await forecastRes.value.json();
      forecast = (forecastData.data ?? []).slice(0, 5).map((d: any) => ({
        date: d.forecastDate,
        temp_min: d.tMin,
        temp_max: d.tMax,
        precipitation_prob: d.precipitaProb,
        wind_direction: d.predWindDir,
        wind_class: d.classWindSpeed,
        weather_type: d.idWeatherType,
      }));
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      source: "IPMA - Instituto Português do Mar e da Atmosfera",
      source_url: "https://api.ipma.pt",
      warnings,
      forecast,
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
