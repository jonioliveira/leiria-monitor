import { NextResponse } from "next/server";
import { db } from "@/db";
import { ipmaWarnings, ipmaForecasts } from "@/db/schema";

export const revalidate = 60;

export async function GET() {
  try {
    const [warnings, forecasts] = await Promise.all([
      db.select().from(ipmaWarnings),
      db.select().from(ipmaForecasts),
    ]);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      source: "IPMA — Instituto Português do Mar e da Atmosfera",
      source_url: "https://api.ipma.pt",
      warnings: warnings.map((w) => ({
        area: w.area,
        type: w.type,
        level: w.level,
        level_color: w.levelColor,
        text: w.text,
        start: w.startTime?.toISOString() ?? null,
        end: w.endTime?.toISOString() ?? null,
      })),
      forecast: forecasts.map((f) => ({
        date: f.forecastDate,
        temp_min: f.tempMin,
        temp_max: f.tempMax,
        precipitation_prob: f.precipProb,
        wind_direction: f.windDir,
        wind_class: f.windClass,
        weather_type: f.weatherType,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
