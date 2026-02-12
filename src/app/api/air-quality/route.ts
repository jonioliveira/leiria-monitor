import { NextResponse } from "next/server";

export const revalidate = 600;

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(
      "https://air-quality-api.open-meteo.com/v1/air-quality" +
        "?latitude=39.7437&longitude=-8.8071" +
        "&current=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone" +
        "&hourly=european_aqi,pm10,pm2_5" +
        "&forecast_days=2" +
        "&timezone=Europe/Lisbon",
      { signal: controller.signal }
    );

    if (!res.ok) {
      throw new Error(`Open-Meteo returned ${res.status}`);
    }

    const raw = await res.json();

    const current = {
      aqi: raw.current?.european_aqi ?? null,
      pm10: raw.current?.pm10 ?? null,
      pm25: raw.current?.pm2_5 ?? null,
      no2: raw.current?.nitrogen_dioxide ?? null,
      ozone: raw.current?.ozone ?? null,
      time: raw.current?.time ?? null,
    };

    const hourly: { time: string; aqi: number | null; pm10: number | null; pm25: number | null }[] = [];
    if (raw.hourly?.time) {
      for (let i = 0; i < raw.hourly.time.length; i++) {
        hourly.push({
          time: raw.hourly.time[i],
          aqi: raw.hourly.european_aqi?.[i] ?? null,
          pm10: raw.hourly.pm10?.[i] ?? null,
          pm25: raw.hourly.pm2_5?.[i] ?? null,
        });
      }
    }

    let status: "ok" | "warning" | "critical" | "unknown" = "unknown";
    if (current.aqi !== null) {
      status = current.aqi <= 20 ? "ok" : current.aqi <= 50 ? "warning" : "critical";
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      source: "Copernicus CAMS via Open-Meteo",
      source_url: "https://open-meteo.com/en/docs/air-quality-api",
      status,
      current,
      hourly,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
