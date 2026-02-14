"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OutageChart } from "@/components/outage-chart";
import { SubstationLoadChart } from "@/components/substation-load-chart";
import {
  Zap,
  Signal,
  Search,
  Activity,
  MessageSquarePlus,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from "lucide-react";
import type { TransformerMarker } from "@/lib/types";

/* ── Local types ──────────────────────────────────────────── */

interface Report {
  id: number;
  type: "electricity" | "telecom_mobile" | "telecom_fixed" | "water";
  operator: string | null;
  description: string | null;
  street: string | null;
  lat: number;
  lng: number;
  upvotes: number;
  createdAt: string;
}

interface ReportsData {
  success: boolean;
  total: number;
  reports: Report[];
}

interface SubstationData {
  success: boolean;
  timestamp: string;
  substations: { name: string; latestLoad: number | null }[];
  baseline: number;
  actual: { time: string; totalLoad: number }[];
  projection: { time: string; projectedLoad: number }[];
  perSubstation: Record<
    string,
    { actual: { time: string; totalLoad: number }[]; baseline: number }
  >;
}

interface MeoConcelhoData {
  concelho: string;
  distrito: string;
  rede_fixa_pct: number | null;
  rede_fixa_previsao: string;
  rede_movel_pct: number | null;
  rede_movel_previsao: string;
  is_leiria_district: boolean;
}

interface TelecomData {
  success: boolean;
  timestamp: string;
  meo_availability: {
    success: boolean;
    last_updated: string | null;
    global: {
      rede_movel_pct: number | null;
      rede_fixa_pct: number | null;
    } | null;
    leiria_district: MeoConcelhoData[];
  };
}

/* ── Helpers ───────────────────────────────────────────────── */

function resolveReportConcelho(
  r: Report,
  transformers: TransformerMarker[],
): string {
  if (r.street) {
    for (const t of transformers) {
      if (r.lat.toFixed(5) === t.lat.toFixed(5) && r.lng.toFixed(5) === t.lng.toFixed(5)) {
        return t.municipality;
      }
    }
  }
  let best = "";
  let bestDist = Infinity;
  for (const t of transformers) {
    const d = (r.lat - t.lat) ** 2 + (r.lng - t.lng) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = t.municipality;
    }
  }
  return best || "Desconhecido";
}

function getCoverageLabel(pct: number | null): string {
  if (pct == null) return "Sem dados";
  if (pct >= 95) return "Normal";
  if (pct >= 80) return "Parcialmente afetado";
  if (pct >= 50) return "Degradado";
  return "Muito afetado";
}

function getCoverageBadge(pct: number | null) {
  const label = getCoverageLabel(pct);
  if (pct == null)
    return (
      <Badge variant="outline" className="text-muted-foreground border-muted">
        Sem dados
      </Badge>
    );
  if (pct >= 95)
    return (
      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
        {pct}% — {label}
      </Badge>
    );
  if (pct >= 80)
    return (
      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
        {pct}% — {label}
      </Badge>
    );
  return (
    <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
      {pct}% — {label}
    </Badge>
  );
}

function getOverallStatus(leiriaDistrict: MeoConcelhoData[]) {
  if (leiriaDistrict.length === 0)
    return { level: "unknown" as const, label: "Sem informação", description: "Não foi possível obter dados de cobertura." };

  const mobilePcts = leiriaDistrict.map((c) => c.rede_movel_pct).filter((p): p is number => p != null);
  if (mobilePcts.length === 0)
    return { level: "unknown" as const, label: "Sem informação", description: "Dados de cobertura móvel indisponíveis." };

  const avg = mobilePcts.reduce((a, b) => a + b, 0) / mobilePcts.length;
  const critical = mobilePcts.filter((p) => p < 80).length;
  const belowNormal = mobilePcts.filter((p) => p < 95).length;

  if (critical > 0)
    return { level: "critical" as const, label: "Cobertura com problemas", description: `${critical} concelho${critical > 1 ? "s" : ""} abaixo de 80%. Média: ${avg.toFixed(0)}%.` };
  if (belowNormal > 0)
    return { level: "warning" as const, label: "Cobertura parcialmente afetada", description: `${belowNormal} concelho${belowNormal > 1 ? "s" : ""} em recuperação. Média: ${avg.toFixed(0)}%.` };
  return { level: "ok" as const, label: "Cobertura normal", description: `Todos os concelhos acima de 95%. Média: ${avg.toFixed(0)}%.` };
}

const STATUS_STYLES = {
  ok: { border: "border-emerald-500/40", bg: "bg-emerald-500/10", text: "text-emerald-400", icon: CheckCircle2 },
  warning: { border: "border-yellow-500/40", bg: "bg-yellow-500/10", text: "text-yellow-400", icon: AlertTriangle },
  critical: { border: "border-red-500/40", bg: "bg-red-500/10", text: "text-red-400", icon: AlertTriangle },
  unknown: { border: "border-slate-500/40", bg: "bg-slate-500/10", text: "text-slate-400", icon: Clock },
};

/* ── Page ──────────────────────────────────────────────────── */

type Tab = "electricity" | "telecom";

export default function RecoveryPage() {
  const [reportsData, setReportsData] = useState<ReportsData | null>(null);
  const [transformers, setTransformers] = useState<TransformerMarker[]>([]);
  const [subData, setSubData] = useState<SubstationData | null>(null);
  const [telecomData, setTelecomData] = useState<TelecomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("electricity");
  const [concelhoFilter, setConcelhoFilter] = useState("");
  const [selectedSubstation, setSelectedSubstation] = useState<string>("");

  useEffect(() => {
    Promise.allSettled([
      fetch("/api/reports").then((r) => r.json()),
      fetch("/api/electricity/transformers").then((r) => r.json()),
      fetch("/api/electricity/substations").then((r) => r.json()),
      fetch("/api/telecom").then((r) => r.json()),
    ]).then(([reportsResult, transformersResult, subResult, telecomResult]) => {
      if (reportsResult.status === "fulfilled") setReportsData(reportsResult.value);
      if (transformersResult.status === "fulfilled") setTransformers(transformersResult.value.transformers ?? []);
      if (subResult.status === "fulfilled") setSubData(subResult.value);
      if (telecomResult.status === "fulfilled") setTelecomData(telecomResult.value);
      setLoading(false);
    });
  }, []);

  const leiriaDistrict = useMemo(
    () => telecomData?.meo_availability?.leiria_district ?? [],
    [telecomData]
  );

  const filteredConcelhos = useMemo(() => {
    if (!concelhoFilter.trim()) return leiriaDistrict;
    const q = concelhoFilter.toLowerCase().trim();
    return leiriaDistrict.filter((c) => c.concelho.toLowerCase().includes(q));
  }, [leiriaDistrict, concelhoFilter]);

  const sortedConcelhos = useMemo(
    () =>
      [...filteredConcelhos].sort((a, b) => {
        const aPct = a.rede_movel_pct ?? 999;
        const bPct = b.rede_movel_pct ?? 999;
        return aPct - bPct;
      }),
    [filteredConcelhos]
  );

  const overallStatus = useMemo(() => getOverallStatus(leiriaDistrict), [leiriaDistrict]);

  /* Derive report counts */
  const reports = reportsData?.reports ?? [];
  const electricReports = useMemo(() => reports.filter((r) => r.type === "electricity"), [reports]);
  const telecomReports = useMemo(
    () => reports.filter((r) => r.type === "telecom_mobile" || r.type === "telecom_fixed"),
    [reports]
  );

  /* Group electricity reports by municipality */
  const reportsByMunicipality = useMemo(() => {
    if (electricReports.length === 0 || transformers.length === 0) return [];
    const counts: Record<string, number> = {};
    for (const r of electricReports) {
      const municipality = resolveReportConcelho(r, transformers);
      counts[municipality] = (counts[municipality] ?? 0) + 1;
    }
    return Object.entries(counts).map(([municipality, count]) => ({ municipality, count }));
  }, [electricReports, transformers]);

  const substationsRecovered = subData?.substations?.filter((s) => s.latestLoad != null && s.latestLoad > 0).length ?? 0;
  const totalSubstations = subData?.substations?.length ?? 0;

  const mobilePcts = leiriaDistrict.map((c) => c.rede_movel_pct).filter((p): p is number => p != null);
  const avgMeoCoverage = mobilePcts.length > 0
    ? Math.round(mobilePcts.reduce((a, b) => a + b, 0) / mobilePcts.length)
    : null;

  const statusStyle = STATUS_STYLES[overallStatus.level];
  const StatusIcon = statusStyle.icon;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-[400px] rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Zap className="h-6 w-6 text-amber-400" />
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">
            Recuperação
          </h1>
          <p className="text-sm text-muted-foreground">
            Eletricidade e telecomunicações — progresso de recuperação
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4 text-violet-400" />
              <span className="text-xs text-muted-foreground">Reportes</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{reports.length}</p>
            <p className="text-xs text-muted-foreground">
              {electricReports.length} elétricos · {telecomReports.length} telecom
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground">Subestações</span>
            </div>
            <p className="mt-1 text-2xl font-bold">
              {substationsRecovered}/{totalSubstations}
            </p>
            <p className="text-xs text-muted-foreground">com carga</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Signal className="h-4 w-4 text-blue-400" />
              <span className="text-xs text-muted-foreground">MEO Média</span>
            </div>
            <p className="mt-1 text-2xl font-bold">
              {avgMeoCoverage != null ? `${avgMeoCoverage}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">cobertura móvel</p>
          </CardContent>
        </Card>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
        <button
          onClick={() => setTab("electricity")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "electricity"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Zap className="h-4 w-4" />
          Eletricidade
        </button>
        <button
          onClick={() => setTab("telecom")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "telecom"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Signal className="h-4 w-4" />
          Telecomunicações
        </button>
      </div>

      {/* ── Electricity tab ── */}
      {tab === "electricity" && (
        <div className="space-y-6">
          {/* Reports by municipality chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Reportes por Concelho</CardTitle>
            </CardHeader>
            <CardContent>
              <OutageChart data={reportsByMunicipality} />
            </CardContent>
          </Card>

          {/* Substation recovery chart */}
          {subData?.actual && subData.actual.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  Recuperação Energética — Subestações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SubstationLoadChart
                  actual={subData.actual}
                  projection={subData.projection}
                  baseline={subData.baseline}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Carga total agregada de {subData.substations.length} subestações no distrito de Leiria.
                  Baseline calculado a partir da semana anterior à tempestade (20–25 Jan).
                </p>
              </CardContent>
            </Card>
          )}

          {/* Per-substation chart */}
          {subData?.substations && subData.substations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Carga por Subestação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <select
                  value={selectedSubstation}
                  onChange={(e) => setSelectedSubstation(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Selecionar subestação...</option>
                  {[...subData.substations]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name} — {s.latestLoad != null ? `${s.latestLoad.toFixed(2)} MW` : "sem dados"}
                      </option>
                    ))}
                </select>

                {selectedSubstation && subData.perSubstation?.[selectedSubstation] ? (
                  <>
                    <SubstationLoadChart
                      actual={subData.perSubstation[selectedSubstation].actual}
                      projection={[]}
                      baseline={subData.perSubstation[selectedSubstation].baseline}
                    />
                    <p className="text-xs text-muted-foreground">
                      Baseline: {subData.perSubstation[selectedSubstation].baseline.toFixed(2)} MW
                      (média pré-tempestade 20–25 Jan).
                      Última carga: {subData.substations.find((s) => s.name === selectedSubstation)?.latestLoad?.toFixed(2) ?? "—"} MW.
                    </p>
                  </>
                ) : selectedSubstation ? (
                  <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                    Sem dados históricos para esta subestação.
                  </div>
                ) : (
                  <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                    Selecione uma subestação para ver o gráfico de carga.
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Telecom tab ── */}
      {tab === "telecom" && (
        <div className="space-y-6">
          {/* Coverage status banner */}
          <div
            className={`flex items-start gap-3 rounded-xl border p-4 ${statusStyle.border} ${statusStyle.bg}`}
          >
            <StatusIcon className={`mt-0.5 h-5 w-5 shrink-0 ${statusStyle.text}`} />
            <div>
              <p className={`text-base font-semibold ${statusStyle.text}`}>
                {overallStatus.label}
              </p>
              <p className="text-sm text-muted-foreground">{overallStatus.description}</p>
            </div>
          </div>

          {/* MEO coverage table */}
          {leiriaDistrict.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Signal className="h-5 w-5 text-sky-400" />
                  <span>Cobertura MEO por concelho</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Procure o seu concelho para ver o estado da rede móvel e fixa.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    placeholder="Procurar concelho (ex: Leiria, Pombal...)"
                    value={concelhoFilter}
                    onChange={(e) => setConcelhoFilter(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                {/* Desktop table */}
                <div className="hidden overflow-x-auto sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Concelho</TableHead>
                        <TableHead className="text-center">Telemóvel</TableHead>
                        <TableHead className="text-center">Internet de casa</TableHead>
                        <TableHead>Previsão normalização</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedConcelhos.map((c) => (
                        <TableRow key={c.concelho}>
                          <TableCell className="font-medium text-base">{c.concelho}</TableCell>
                          <TableCell className="text-center">{getCoverageBadge(c.rede_movel_pct)}</TableCell>
                          <TableCell className="text-center">{getCoverageBadge(c.rede_fixa_pct)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {c.rede_movel_previsao || c.rede_fixa_previsao || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {sortedConcelhos.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                            Nenhum concelho encontrado para &quot;{concelhoFilter}&quot;
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile cards */}
                <div className="space-y-3 sm:hidden">
                  {sortedConcelhos.map((c) => (
                    <div key={c.concelho} className="rounded-lg border border-border p-4 space-y-2">
                      <p className="text-base font-semibold text-foreground">{c.concelho}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Telemóvel</span>
                        {getCoverageBadge(c.rede_movel_pct)}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Internet de casa</span>
                        {getCoverageBadge(c.rede_fixa_pct)}
                      </div>
                      {(c.rede_movel_previsao || c.rede_fixa_previsao) && (
                        <p className="text-xs text-muted-foreground">
                          Previsão: {c.rede_movel_previsao || c.rede_fixa_previsao}
                        </p>
                      )}
                    </div>
                  ))}
                  {sortedConcelhos.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Nenhum concelho encontrado para &quot;{concelhoFilter}&quot;
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Source */}
      <p className="text-xs text-muted-foreground">
        Fontes: Reportes de utilizadores · E-REDES Open Data Portal · MEO Disponibilidade
      </p>
    </div>
  );
}
