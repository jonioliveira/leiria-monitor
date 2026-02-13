"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { WarningBadge } from "@/components/warning-badge";
import { CloudRain, Thermometer, Droplets, Wind } from "lucide-react";

interface Warning {
  area: string;
  type: string;
  level: string;
  level_color: string;
  text: string | null;
  start: string | null;
  end: string | null;
}

interface ForecastDay {
  date: string;
  temp_min: number | null;
  temp_max: number | null;
  precipitation_prob: number | null;
  wind_direction: string | null;
  wind_class: number | null;
  weather_type: number | null;
}

interface WeatherData {
  success: boolean;
  timestamp: string;
  warnings: Warning[];
  forecast: ForecastDay[];
}

const WEATHER_TYPE_LABELS: Record<number, string> = {
  1: "Céu limpo",
  2: "Céu pouco nublado",
  3: "Céu parcialmente nublado",
  4: "Céu muito nublado ou encoberto",
  5: "Céu nublado por nuvens altas",
  6: "Chuva fraca",
  7: "Chuva fraca",
  8: "Chuva forte",
  9: "Chuva forte",
  10: "Chuva intermitente",
  11: "Chuva intermitente forte",
  12: "Chuvisco",
  13: "Aguaceiros",
  14: "Aguaceiros fortes",
  15: "Trovoada",
  16: "Neve",
  17: "Granizo",
  18: "Nevoeiro",
  19: "Geada",
  20: "Chuva com neve",
};

export default function MeteorologiaPage() {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/weather")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </div>
        <div className="grid gap-4 sm:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const warnings = data?.warnings ?? [];
  const forecast = data?.forecast ?? [];
  const activeWarnings = warnings.filter((w) => w.level !== "green");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <CloudRain className="h-6 w-6 text-blue-400" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Meteorologia</h1>
          <p className="text-sm text-muted-foreground">
            Avisos e previsão — IPMA
          </p>
        </div>
      </div>

      {/* Warnings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Avisos Meteorológicos
            {activeWarnings.length > 0 && (
              <span className="ml-2 text-yellow-400">
                ({activeWarnings.length} ativo{activeWarnings.length > 1 ? "s" : ""})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeWarnings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem avisos meteorológicos ativos para a região de Leiria.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {activeWarnings.map((w, i) => (
                <div key={i}>
                  <WarningBadge level={w.level} type={w.type} text={w.text} />
                  {(w.start || w.end) && (
                    <p className="mt-1 px-1 text-xs text-muted-foreground">
                      {w.start &&
                        `Início: ${new Date(w.start).toLocaleString("pt-PT")}`}
                      {w.start && w.end && " · "}
                      {w.end &&
                        `Fim: ${new Date(w.end).toLocaleString("pt-PT")}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* 5-day forecast */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Previsão a 5 Dias — Leiria</CardTitle>
        </CardHeader>
        <CardContent>
          {forecast.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem dados de previsão disponíveis.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {forecast.map((day, i) => {
                const dateStr = day.date
                  ? new Date(day.date + "T00:00:00").toLocaleDateString("pt-PT", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })
                  : "—";

                return (
                  <div
                    key={i}
                    className="rounded-lg border border-border bg-card p-3 text-center"
                  >
                    <p className="text-xs font-medium text-foreground capitalize">
                      {dateStr}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {day.weather_type != null
                        ? WEATHER_TYPE_LABELS[day.weather_type] ?? `Tipo ${day.weather_type}`
                        : "—"}
                    </p>
                    <div className="mt-3 flex items-center justify-center gap-2">
                      <Thermometer className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm font-semibold text-blue-400">
                        {day.temp_min ?? "—"}°
                      </span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-sm font-semibold text-orange-400">
                        {day.temp_max ?? "—"}°
                      </span>
                    </div>
                    {day.precipitation_prob != null && (
                      <div className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                        <Droplets className="h-3 w-3" />
                        {day.precipitation_prob}%
                      </div>
                    )}
                    {day.wind_direction && (
                      <div className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                        <Wind className="h-3 w-3" />
                        {day.wind_direction}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Fonte: IPMA — Instituto Português do Mar e da Atmosfera
        {data?.timestamp && (
          <> · Atualizado: {new Date(data.timestamp).toLocaleString("pt-PT")}</>
        )}
      </p>
    </div>
  );
}
