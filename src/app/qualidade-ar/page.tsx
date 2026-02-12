"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Wind } from "lucide-react";

interface AirQualityData {
  success: boolean;
  timestamp: string;
  source: string;
  source_url: string;
  status: string;
  current: {
    aqi: number | null;
    pm10: number | null;
    pm25: number | null;
    no2: number | null;
    ozone: number | null;
    time: string | null;
  };
  hourly: {
    time: string;
    aqi: number | null;
    pm10: number | null;
    pm25: number | null;
  }[];
}

const AQI_SCALE = [
  { max: 20, label: "Bom", color: "bg-emerald-500", textColor: "text-emerald-400" },
  { max: 40, label: "Razoável", color: "bg-lime-500", textColor: "text-lime-400" },
  { max: 50, label: "Moderado", color: "bg-yellow-500", textColor: "text-yellow-400" },
  { max: 75, label: "Fraco", color: "bg-orange-500", textColor: "text-orange-400" },
  { max: 100, label: "Mau", color: "bg-red-500", textColor: "text-red-400" },
  { max: Infinity, label: "Muito Mau", color: "bg-purple-500", textColor: "text-purple-400" },
];

function getAqiInfo(aqi: number | null) {
  if (aqi === null) return { label: "Sem dados", color: "bg-slate-500", textColor: "text-slate-400" };
  return AQI_SCALE.find((s) => aqi <= s.max) ?? AQI_SCALE[AQI_SCALE.length - 1];
}

const STATUS_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  ok: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  unknown: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  critical: "Crítico",
  warning: "Degradado",
  ok: "Operacional",
  unknown: "Sem Dados",
};

export default function QualidadeArPage() {
  const [data, setData] = useState<AirQualityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/air-quality")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  const current = data?.current;
  const aqiInfo = getAqiInfo(current?.aqi ?? null);

  // Get next 24h of hourly data
  const now = new Date();
  const next24h = data?.hourly?.filter((h) => {
    const t = new Date(h.time);
    return t >= now && t <= new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }) ?? [];

  const maxAqi = Math.max(...next24h.map((h) => h.aqi ?? 0), 1);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wind className="h-6 w-6 text-green-400" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Qualidade do Ar</h1>
            <p className="text-sm text-muted-foreground">
              Distrito de Leiria — dados Copernicus CAMS
            </p>
          </div>
        </div>
        <Badge variant="outline" className={STATUS_COLORS[data?.status ?? "unknown"]}>
          {STATUS_LABELS[data?.status ?? "unknown"]}
        </Badge>
      </div>

      {/* Current Conditions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Condições Atuais</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-8">
            {/* AQI Gauge */}
            <div className="flex flex-col items-center gap-2">
              <div className={`flex h-24 w-24 items-center justify-center rounded-full ${aqiInfo.color}/20`}>
                <span className={`text-3xl font-bold ${aqiInfo.textColor}`}>
                  {current?.aqi ?? "—"}
                </span>
              </div>
              <span className={`text-sm font-medium ${aqiInfo.textColor}`}>
                {aqiInfo.label}
              </span>
              <span className="text-xs text-muted-foreground">Índice Europeu (EAQI)</span>
            </div>

            {/* Pollutants */}
            <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg bg-secondary p-3 text-center">
                <p className="text-lg font-bold">{current?.pm25 ?? "—"}</p>
                <p className="text-xs text-muted-foreground">PM2.5 µg/m³</p>
              </div>
              <div className="rounded-lg bg-secondary p-3 text-center">
                <p className="text-lg font-bold">{current?.pm10 ?? "—"}</p>
                <p className="text-xs text-muted-foreground">PM10 µg/m³</p>
              </div>
              <div className="rounded-lg bg-secondary p-3 text-center">
                <p className="text-lg font-bold">{current?.no2 ?? "—"}</p>
                <p className="text-xs text-muted-foreground">NO₂ µg/m³</p>
              </div>
              <div className="rounded-lg bg-secondary p-3 text-center">
                <p className="text-lg font-bold">{current?.ozone ?? "—"}</p>
                <p className="text-xs text-muted-foreground">O₃ µg/m³</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AQI Scale */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Escala de Qualidade do Ar (EAQI)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {AQI_SCALE.map((level) => (
              <div
                key={level.label}
                className={`rounded-md p-2 text-center ${level.color}/15`}
              >
                <p className={`text-sm font-semibold ${level.textColor}`}>{level.label}</p>
                <p className="text-xs text-muted-foreground">
                  {level.max === 20
                    ? "0–20"
                    : level.max === 40
                      ? "21–40"
                      : level.max === 50
                        ? "41–50"
                        : level.max === 75
                          ? "51–75"
                          : level.max === 100
                            ? "76–100"
                            : ">100"}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 24h Forecast */}
      {next24h.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Previsão próximas 24 horas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-1 overflow-x-auto pb-2">
              {next24h.map((h) => {
                const info = getAqiInfo(h.aqi);
                const height = h.aqi != null ? Math.max((h.aqi / maxAqi) * 80, 8) : 8;
                return (
                  <div key={h.time} className="flex min-w-[2.5rem] flex-col items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      {h.aqi ?? "—"}
                    </span>
                    <div
                      className={`w-5 rounded-sm ${info.color}/60`}
                      style={{ height: `${height}px` }}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(h.time).toLocaleTimeString("pt-PT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Source */}
      <p className="text-xs text-muted-foreground">
        Fonte: {data?.source ?? "Copernicus CAMS via Open-Meteo"} —{" "}
        {data?.timestamp
          ? `Última atualização: ${new Date(data.timestamp).toLocaleString("pt-PT")}`
          : ""}
      </p>
    </div>
  );
}
