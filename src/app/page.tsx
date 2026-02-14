"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { WarningBadge } from "@/components/warning-badge";
import {
  Zap,
  CloudRain,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  ShieldAlert,
  ExternalLink,
  Satellite,
  Map,
  Signal,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────── */

interface DashboardData {
  success: boolean;
  timestamp: string;
  summary: {
    electricity: {
      status: string;
      totalOutages: number;
      municipalitiesAffected: number;
      substationsTotal: number;
      substationsActive: number;
    };
    weather: {
      status: string;
      activeWarnings: number;
    };
    occurrences: {
      status: string;
      activeCount: number;
    };
    scheduledWork: {
      count: number;
    };
    copernicus: {
      status: string;
      products: number;
      aois: number;
      active: boolean;
    };
  };
  recentWarnings: {
    type: string;
    level: string;
    levelColor: string;
    text: string | null;
  }[];
  populationWarnings: {
    id: number;
    title: string;
    summary: string;
    detailUrl: string | null;
    fetchedAt: string;
  }[];
}

const STATUS_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  ok: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  unknown: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  critical: "Critico",
  warning: "Degradado",
  ok: "Operacional",
  unknown: "Sem Dados",
};

/* ── Page ──────────────────────────────────────────────────── */

export default function HomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/dashboard");
      if (res.ok) setData(await res.json());
    } catch {
      // silent fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Rede Sentinela — Distrito de Leiria
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitorização após a tempestade Kristin (28 Jan 2026)
          </p>
          {data?.timestamp && (
            <p className="mt-1 text-xs text-muted-foreground">
              Última atualização: {new Date(data.timestamp).toLocaleString("pt-PT")}
            </p>
          )}
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* ANEPC Population Warnings */}
      {(data?.populationWarnings?.length ?? 0) > 0 && (
        <div className="space-y-3">
          {data!.populationWarnings.map((w) => (
            <div key={w.id} className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-red-400">{w.title}</h3>
                    <Badge
                      variant="outline"
                      className="border-red-500/30 bg-red-500/20 text-red-400 text-[10px]"
                    >
                      ANEPC
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-foreground leading-relaxed">{w.summary}</p>
                  {w.detailUrl && (
                    <a
                      href={w.detailUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Ver aviso completo
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Status grid — 2x2 mobile, 4-col desktop */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Electricity */}
        <Link href="/recovery">
          <Card className="cursor-pointer transition-colors hover:bg-accent/50 h-full overflow-hidden">
            <CardHeader className="flex flex-col gap-1 pb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Zap className="h-4 w-4 shrink-0 text-amber-400" />
                Eletricidade
              </CardTitle>
              <Badge variant="outline" className={`w-fit ${STATUS_COLORS[data?.summary.electricity.status ?? "unknown"]}`}>
                {STATUS_LABELS[data?.summary.electricity.status ?? "unknown"]}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{data?.summary.electricity.totalOutages ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                Reportes · {data?.summary.electricity.municipalitiesAffected ?? 0} concelhos
              </p>
              {(data?.summary.electricity.substationsTotal ?? 0) > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="text-emerald-400 font-medium">
                    {data!.summary.electricity.substationsActive}
                  </span>
                  /{data!.summary.electricity.substationsTotal} subestações ativas
                </p>
              )}
              <div className="mt-3 flex items-center text-xs text-primary">
                Recuperação <ArrowRight className="ml-1 h-3 w-3" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Weather */}
        <Link href="/situation">
          <Card className="cursor-pointer transition-colors hover:bg-accent/50 h-full overflow-hidden">
            <CardHeader className="flex flex-col gap-1 pb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <CloudRain className="h-4 w-4 shrink-0 text-blue-400" />
                Meteorologia
              </CardTitle>
              <Badge variant="outline" className={`w-fit ${STATUS_COLORS[data?.summary.weather.status ?? "unknown"]}`}>
                {STATUS_LABELS[data?.summary.weather.status ?? "unknown"]}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{data?.summary.weather.activeWarnings ?? "—"}</p>
              <p className="text-xs text-muted-foreground">Avisos ativos</p>
              <div className="mt-3 flex items-center text-xs text-primary">
                Situação <ArrowRight className="ml-1 h-3 w-3" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Occurrences */}
        <Link href="/situation">
          <Card className="cursor-pointer transition-colors hover:bg-accent/50 h-full overflow-hidden">
            <CardHeader className="flex flex-col gap-1 pb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0 text-orange-400" />
                Ocorrências
              </CardTitle>
              <Badge variant="outline" className={`w-fit ${STATUS_COLORS[data?.summary.occurrences.status ?? "unknown"]}`}>
                {STATUS_LABELS[data?.summary.occurrences.status ?? "unknown"]}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{data?.summary.occurrences.activeCount ?? "—"}</p>
              <p className="text-xs text-muted-foreground">Ativas</p>
              <div className="mt-3 flex items-center text-xs text-primary">
                Situação <ArrowRight className="ml-1 h-3 w-3" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Copernicus */}
        <Link href="/situation">
          <Card className="cursor-pointer transition-colors hover:bg-accent/50 h-full overflow-hidden">
            <CardHeader className="flex flex-col gap-1 pb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Satellite className="h-4 w-4 shrink-0 text-purple-400" />
                Copernicus
              </CardTitle>
              <Badge variant="outline" className={`w-fit ${STATUS_COLORS[data?.summary.copernicus?.status ?? "unknown"]}`}>
                {STATUS_LABELS[data?.summary.copernicus?.status ?? "unknown"]}
              </Badge>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{data?.summary.copernicus?.products ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                Produtos · {data?.summary.copernicus?.aois ?? 0} AOIs
              </p>
              <div className="mt-3 flex items-center text-xs text-primary">
                Situação <ArrowRight className="ml-1 h-3 w-3" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Quick alerts */}
      {(data?.recentWarnings?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            Avisos meteorológicos recentes
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data!.recentWarnings.map((w, i) => (
              <WarningBadge key={i} level={w.level} type={w.type} text={w.text} />
            ))}
          </div>
        </div>
      )}

      {/* Map shortcut */}
      <Link href="/map">
        <Card className="cursor-pointer transition-colors hover:bg-accent/50">
          <CardContent className="flex items-center gap-3 py-4">
            <Map className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Ver mapa completo</p>
              <p className="text-xs text-muted-foreground">
                Reportes, antenas e ocorrências
              </p>
            </div>
            <ArrowRight className="ml-auto h-4 w-4 text-primary" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
