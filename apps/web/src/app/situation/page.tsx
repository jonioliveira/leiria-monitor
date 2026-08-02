"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { WarningBadge } from "@/components/warning-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CloudRain,
  Thermometer,
  Droplets,
  Wind,
  Satellite,
  ExternalLink,
} from "lucide-react";

/* ── Local types ──────────────────────────────────────────── */

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

interface Occurrence {
  id: number;
  externalId: string | null;
  nature: string | null;
  state: string | null;
  municipality: string | null;
  coordinates: { lat: number; lng: number } | null;
  startTime: string | null;
  numMeans: number | null;
  numOperatives: number | null;
  numAerialMeans: number | null;
  fetchedAt: string;
}

interface OccurrencesData {
  success: boolean;
  timestamp: string;
  total: number;
  occurrences: Occurrence[];
}

interface CopernicusData {
  success: boolean;
  timestamp: string;
  source: string;
  source_url: string;
  status: string;
  activation: {
    code: string;
    name: string | null;
    countries: string[];
    activationTime: string | null;
    closed: string | null;
    n_aois: number;
    n_products: number;
    drmPhase: string | null;
    centroid: { type: string; coordinates: number[] } | null;
  };
}

/* ── Constants ─────────────────────────────────────────────── */

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

const DRM_PHASES: Record<string, string> = {
  response: "Resposta",
  recovery: "Recuperação",
  preparedness: "Preparação",
  prevention: "Prevenção",
};

/* ── Page ──────────────────────────────────────────────────── */

type Tab = "weather" | "occurrences";

export default function SituationPage() {
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [occData, setOccData] = useState<OccurrencesData | null>(null);
  const [copData, setCopData] = useState<CopernicusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("weather");

  useEffect(() => {
    Promise.allSettled([
      fetch("/api/weather").then((r) => r.json()),
      fetch("/api/occurrences").then((r) => r.json()),
      fetch("/api/copernicus").then((r) => r.json()),
    ]).then(([weatherResult, occResult, copResult]) => {
      if (weatherResult.status === "fulfilled") setWeatherData(weatherResult.value);
      if (occResult.status === "fulfilled") setOccData(occResult.value);
      if (copResult.status === "fulfilled") setCopData(copResult.value);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-[400px] rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  const warnings = weatherData?.warnings ?? [];
  const forecast = weatherData?.forecast ?? [];
  const activeWarnings = warnings.filter((w) => w.level !== "green");
  const occurrences = occData?.occurrences ?? [];
  const totalOcc = occData?.total ?? 0;
  const activation = copData?.activation;
  const isActive = activation ? !activation.closed : false;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-6 w-6 text-orange-400" />
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">
            Situação Atual
          </h1>
          <p className="text-sm text-muted-foreground">
            Meteorologia, ocorrências e observação por satélite
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <CloudRain className="h-4 w-4 text-blue-400" />
              <span className="text-xs text-muted-foreground">Avisos Meteo</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{activeWarnings.length}</p>
            <p className="text-xs text-muted-foreground">
              {activeWarnings.length === 0 ? "sem alertas" : `ativo${activeWarnings.length > 1 ? "s" : ""}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-400" />
              <span className="text-xs text-muted-foreground">Ocorrências</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{totalOcc}</p>
            <p className="text-xs text-muted-foreground">
              {totalOcc === 0 ? "sem ocorrências" : `ativa${totalOcc > 1 ? "s" : ""}`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Satellite className="h-4 w-4 text-purple-400" />
              <span className="text-xs text-muted-foreground">Copernicus</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{isActive ? "Ativa" : "Encerrada"}</p>
            <p className="text-xs text-muted-foreground">
              {activation?.code ?? "EMSR861"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
        <button
          onClick={() => setTab("weather")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "weather"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CloudRain className="h-4 w-4" />
          Meteorologia
        </button>
        <button
          onClick={() => setTab("occurrences")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "occurrences"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Ocorrências
        </button>
      </div>

      {/* ── Weather tab ── */}
      {tab === "weather" && (
        <div className="space-y-6">
          {/* Weather warnings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <CloudRain className="h-4 w-4 text-blue-400" />
                Avisos Meteorológicos
                {activeWarnings.length > 0 && (
                  <span className="text-yellow-400">
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
                          {w.start && `Início: ${new Date(w.start).toLocaleString("pt-PT")}`}
                          {w.start && w.end && " · "}
                          {w.end && `Fim: ${new Date(w.end).toLocaleString("pt-PT")}`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

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
                      <div key={i} className="rounded-lg border border-border bg-card p-3 text-center">
                        <p className="text-xs font-medium text-foreground capitalize">{dateStr}</p>
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
        </div>
      )}

      {/* ── Occurrences tab ── */}
      {tab === "occurrences" && (
        <div className="space-y-6">
          {/* Occurrences table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-400" />
                  Ocorrências — Proteção Civil
                </div>
                <Badge
                  variant="outline"
                  className={
                    totalOcc === 0
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : totalOcc <= 3
                        ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                        : "bg-red-500/20 text-red-400 border-red-500/30"
                  }
                >
                  {totalOcc === 0 ? "Sem ocorrências" : `${totalOcc} ativa${totalOcc > 1 ? "s" : ""}`}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {occurrences.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sem ocorrências ativas no distrito de Leiria.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Natureza</TableHead>
                      <TableHead>Concelho</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Meios</TableHead>
                      <TableHead>Operacionais</TableHead>
                      <TableHead>Início</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {occurrences.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.nature ?? "—"}</TableCell>
                        <TableCell>{o.municipality ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {o.state ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>{o.numMeans ?? "—"}</TableCell>
                        <TableCell>{o.numOperatives ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {o.startTime
                            ? new Date(o.startTime).toLocaleString("pt-PT")
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Copernicus EMS */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Satellite className="h-4 w-4 text-purple-400" />
                  Copernicus EMS — {activation?.code ?? "EMSR861"}
                </div>
                <Badge
                  variant="outline"
                  className={
                    isActive
                      ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                      : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                  }
                >
                  {isActive ? "Ativa" : "Encerrada"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {activation?.name && (
                <div>
                  <p className="text-xs text-muted-foreground">Evento</p>
                  <p className="font-medium">{activation.name}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Estado</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${isActive ? "bg-yellow-400 animate-pulse" : "bg-emerald-400"}`}
                    />
                    <p className="font-medium">{isActive ? "Ativa" : "Encerrada"}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Fase DRM</p>
                  <p className="font-medium">
                    {activation?.drmPhase
                      ? DRM_PHASES[activation.drmPhase] ?? activation.drmPhase
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Áreas (AOIs)</p>
                  <p className="text-2xl font-bold">{activation?.n_aois ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Produtos</p>
                  <p className="text-2xl font-bold">{activation?.n_products ?? 0}</p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card/50 p-3 text-sm text-muted-foreground">
                <p>
                  A ativação {activation?.code ?? "EMSR861"} do Copernicus EMS foi solicitada
                  na sequência da tempestade Kristin, fornecendo mapeamento de emergência
                  baseado em satélite para o distrito de Leiria.
                </p>
              </div>

              <a
                href="https://mapping.emergency.copernicus.eu/activations/EMSR861"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-purple-500/10 px-4 py-2 text-sm font-medium text-purple-400 transition-colors hover:bg-purple-500/20"
              >
                Ver no portal Copernicus EMS
                <ExternalLink className="h-4 w-4" />
              </a>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sources */}
      <p className="text-xs text-muted-foreground">
        Fontes: IPMA · ANEPC · Copernicus EMS
        {weatherData?.timestamp && (
          <> · Atualizado: {new Date(weatherData.timestamp).toLocaleString("pt-PT")}</>
        )}
      </p>
    </div>
  );
}
