"use client";

import { useState, useEffect, useCallback, ReactNode } from "react";
import Card from "@/components/Card";
import StatusBadge from "@/components/StatusBadge";
import type {
  ElectricityData,
  WeatherData,
  TelecomData,
  WaterData,
  RecoveryData,
} from "@/lib/types";

// ── Icons ──────────────────────────────────────────────

const BoltIcon = () => (
  <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);
const CloudIcon = () => (
  <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
  </svg>
);
const WifiIcon = () => (
  <svg className="w-5 h-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
  </svg>
);
const DropletIcon = () => (
  <svg className="w-5 h-5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21c-4.97 0-9-4.03-9-9 0-4.632 8.087-11.215 8.44-11.489a.75.75 0 011.12 0C12.913.785 21 7.368 21 12c0 4.97-4.03 9-9 9z" />
  </svg>
);
const HeartIcon = () => (
  <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
  </svg>
);
const RefreshIcon = ({ spinning }: { spinning: boolean }) => (
  <svg className={`w-4 h-4 ${spinning ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);
const ChevronIcon = () => (
  <svg className="w-4 h-4 chevron-icon text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

// ── Helpers ────────────────────────────────────────────

const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000;

function pctColor(pct: number | null | undefined): string {
  if (pct == null) return "#a0aec0";
  if (pct >= 95) return "#38a169";
  if (pct >= 80) return "#dd6b20";
  return "#e53e3e";
}

function statusColor(s: string): string {
  switch (s) {
    case "critical": return "#e53e3e";
    case "warning": return "#dd6b20";
    case "ok": return "#38a169";
    default: return "#a0aec0";
  }
}

function Collapsible({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen || undefined}>
      <summary className="flex items-center justify-between py-2.5 group">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider group-hover:text-[var(--text-secondary)] transition-colors">
          {title}
        </span>
        <ChevronIcon />
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

// ── Main Dashboard ─────────────────────────────────────

export default function Dashboard() {
  const [electricity, setElectricity] = useState<ElectricityData | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [telecom, setTelecom] = useState<TelecomData | null>(null);
  const [water, setWater] = useState<WaterData | null>(null);
  const [recovery, setRecovery] = useState<RecoveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [telecomTab, setTelecomTab] = useState<"leiria" | "operators" | "district">("leiria");

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [elecRes, weatherRes, telecomRes, waterRes, recoveryRes] =
        await Promise.allSettled([
          fetch("/api/electricity").then((r) => r.json()),
          fetch("/api/weather").then((r) => r.json()),
          fetch("/api/telecom").then((r) => r.json()),
          fetch("/api/water").then((r) => r.json()),
          fetch("/api/recovery").then((r) => r.json()),
        ]);
      if (elecRes.status === "fulfilled") setElectricity(elecRes.value);
      if (weatherRes.status === "fulfilled") setWeather(weatherRes.value);
      if (telecomRes.status === "fulfilled") setTelecom(telecomRes.value);
      if (waterRes.status === "fulfilled") setWater(waterRes.value);
      if (recoveryRes.status === "fulfilled") setRecovery(recoveryRes.value);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // ── Derive statuses ──
  const elecStatus =
    electricity?.leiria?.active_outages &&
    electricity.leiria.active_outages.total_outage_count > 0
      ? "critical"
      : electricity?.success ? "ok" : "unknown";

  const weatherStatus =
    weather?.warnings?.some((w) => w.level === "red")
      ? "critical"
      : weather?.warnings?.some((w) => w.level === "orange")
        ? "warning"
        : weather?.success ? "ok" : "unknown";

  const leiriaMovel = telecom?.meo_availability?.leiria_concelho?.rede_movel_pct;
  const telecomStatus =
    leiriaMovel != null
      ? leiriaMovel >= 95 ? "ok" : leiriaMovel >= 70 ? "warning" : "critical"
      : telecom?.operators?.some((o) => !o.reachable) ? "warning"
      : telecom?.success ? "ok" : "unknown";

  const waterStatus = water?.smas_website?.reachable ? "ok" : water?.success ? "warning" : "unknown";

  const recoveryStatus = recovery?.success
    ? recovery.summary.platforms_online === recovery.summary.platforms_total
      ? "ok" : recovery.summary.platforms_online > 0 ? "warning" : "critical"
    : "unknown";

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
    } catch { return dateStr; }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--text-muted)] font-mono text-sm">A carregar dados...</p>
        </div>
      </div>
    );
  }

  const outageRecords = electricity?.leiria?.active_outages?.records ?? [];
  const maxOutageCount = Math.max(...outageRecords.map((r) => r.count), 1);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* ── Header ── */}
      <header className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full status-pulse" />
              <div>
                <h1 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
                  Leiria Monitor
                </h1>
                <p className="text-xs text-[var(--text-muted)] -mt-0.5">
                  Recuperacao pos-tempestade Kristin &middot; 28 Jan 2026
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {lastRefresh && (
                <span className="text-xs text-[var(--text-muted)] font-mono hidden sm:block">
                  {formatTime(lastRefresh)}
                </span>
              )}
              <button
                onClick={fetchAll}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 text-xs font-medium hover:bg-blue-100 transition-colors disabled:opacity-50"
              >
                <RefreshIcon spinning={refreshing} />
                <span className="hidden sm:inline">Atualizar</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* ── Summary Tiles ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            {
              label: "Eletricidade", status: elecStatus,
              value: electricity?.leiria?.active_outages?.total_outage_count?.toString() ?? "0",
              unit: "interrupcoes ativas",
            },
            {
              label: "Meteorologia", status: weatherStatus,
              value: weather?.warnings?.length?.toString() ?? "0",
              unit: "avisos ativos",
            },
            {
              label: "Rede Movel", status: telecomStatus,
              value: leiriaMovel != null ? `${leiriaMovel}%` : "—",
              unit: "MEO Leiria",
            },
            {
              label: "Agua", status: waterStatus,
              value: water?.smas_website?.reachable ? "Online" : "Offline",
              unit: "SMAS Leiria",
            },
            {
              label: "Apoios", status: recoveryStatus,
              value: recovery ? `${recovery.summary.platforms_online}/${recovery.summary.platforms_total}` : "—",
              unit: "plataformas online",
            },
          ].map((tile) => (
            <div
              key={tile.label}
              className="relative p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] animate-slide-up"
              style={{ boxShadow: "var(--shadow-tile)", borderLeftWidth: 3, borderLeftColor: statusColor(tile.status) }}
            >
              <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">
                {tile.label}
              </p>
              <p className="text-3xl font-bold font-mono leading-none text-[var(--text-primary)]">{tile.value}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">{tile.unit}</p>
            </div>
          ))}
        </div>

        {/* ── Main Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ━━ Electricity Card ━━ */}
          <Card title="Eletricidade" icon={<BoltIcon />} accentColor={elecStatus === "critical" ? "red" : "none"} headerRight={<StatusBadge status={elecStatus as any} />}>
            <div className="space-y-5">
              {/* National context */}
              {electricity?.national?.total_active_outages != null && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <span className="text-sm text-[var(--text-secondary)]">Total nacional (E-Redes)</span>
                  <span className="font-mono text-base font-bold text-amber-600">
                    {electricity.national.total_active_outages.toLocaleString("pt-PT")}
                  </span>
                </div>
              )}

              {/* Active outages by municipality — bar chart */}
              {outageRecords.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold">Interrupcoes por concelho</h4>
                    <span className="text-xs font-mono text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                      {electricity!.leiria!.active_outages!.total_outage_count} total
                    </span>
                  </div>
                  <div className="space-y-2">
                    {outageRecords.sort((a, b) => b.count - a.count).map((r, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-sm font-medium w-32 sm:w-40 truncate text-[var(--text-primary)]">{r.municipality}</span>
                        <div className="flex-1 h-7 bg-red-50 rounded-lg overflow-hidden border border-red-100">
                          <div
                            className="h-full bg-red-400 rounded-lg bar-fill"
                            style={{ width: `${Math.max((r.count / maxOutageCount) * 100, 2)}%` }}
                          />
                        </div>
                        <span className="text-sm font-mono font-semibold text-red-600 w-10 text-right">{r.count}</span>
                      </div>
                    ))}
                  </div>
                  {electricity!.leiria!.active_outages!.extraction_datetime && (
                    <p className="text-xs text-[var(--text-muted)] font-mono mt-3">
                      Dados de {new Date(electricity!.leiria!.active_outages!.extraction_datetime).toLocaleString("pt-PT")}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 bg-emerald-50 rounded-xl border border-emerald-200">
                  <p className="text-emerald-700 font-semibold">Sem interrupcoes ativas</p>
                  <p className="text-sm text-emerald-600 mt-1">Distrito de Leiria</p>
                </div>
              )}

              {/* Scheduled interruptions */}
              {electricity?.leiria?.scheduled_interruptions?.records && electricity.leiria.scheduled_interruptions.records.length > 0 && (
                <Collapsible title={`Trabalhos programados (${electricity.leiria.scheduled_interruptions.records.length})`}>
                  <div className="space-y-2">
                    {electricity.leiria.scheduled_interruptions.records.map((r, i) => (
                      <div key={i} className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm text-amber-900">{r.locality || r.municipality}</span>
                          <span className="text-xs font-mono text-amber-600">{r.postal_code}</span>
                        </div>
                        {r.reason && <p className="text-xs text-amber-700 mt-1">{r.reason}</p>}
                        <div className="flex gap-3 mt-1 text-xs font-mono text-amber-600">
                          {r.start_time && <span>De: {formatDate(r.start_time)}</span>}
                          {r.end_time && <span>Ate: {formatDate(r.end_time)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </Collapsible>
              )}

              {/* Transformers summary */}
              {electricity?.transformers && (
                <div className="flex items-center gap-4 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <div className="flex-1">
                    <p className="text-sm text-[var(--text-secondary)]">
                      <span className="font-bold text-[var(--text-primary)]">{electricity.transformers.total_count.toLocaleString("pt-PT")}</span> postos de transformacao
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      ~{electricity.transformers.total_clients.toLocaleString("pt-PT")} clientes &middot; {Math.round(electricity.transformers.total_capacity_kva / 1000).toLocaleString("pt-PT")} MVA capacidade
                    </p>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-[var(--border-subtle)]">
                <a href="https://e-redes.opendatasoft.com" target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[var(--accent-blue)] hover:underline font-mono">
                  Fonte: E-Redes Open Data &rarr;
                </a>
              </div>
            </div>
          </Card>

          {/* ━━ Weather Card ━━ */}
          <Card title="Meteorologia" icon={<CloudIcon />}
            accentColor={weatherStatus === "critical" ? "red" : weatherStatus === "warning" ? "amber" : "blue"}
            headerRight={<StatusBadge status={weatherStatus as any} />}>
            <div className="space-y-5">
              {weather?.warnings && weather.warnings.length > 0 ? (
                <div className="space-y-2">
                  {weather.warnings.map((w, i) => (
                    <div key={i} className="p-4 rounded-xl border" style={{ backgroundColor: `${w.level_color}08`, borderColor: `${w.level_color}30` }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: w.level_color }} />
                          <span className="font-semibold text-[var(--text-primary)]">{w.type}</span>
                        </div>
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: w.level_color, backgroundColor: `${w.level_color}15` }}>
                          {w.level_label}
                        </span>
                      </div>
                      {w.text && <p className="text-sm text-[var(--text-secondary)] mb-2">{w.text}</p>}
                      <div className="flex gap-4 text-xs font-mono text-[var(--text-muted)]">
                        {w.start && <span>De: {formatDate(w.start)}</span>}
                        {w.end && <span>Ate: {formatDate(w.end)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 bg-emerald-50 rounded-xl border border-emerald-200">
                  <p className="text-emerald-700 font-medium">Sem avisos ativos</p>
                  <p className="text-sm text-emerald-600 mt-1">Distrito de Leiria</p>
                </div>
              )}

              {weather?.forecast && weather.forecast.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">Previsao 5 dias</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {weather.forecast.map((d, i) => (
                      <div key={i} className="text-center p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                        <p className="text-xs font-mono text-[var(--text-muted)]">{formatDate(d.date)}</p>
                        <p className="text-lg font-semibold mt-1">
                          <span className="text-blue-500">{d.temp_min}&deg;</span>
                          <span className="text-[var(--text-muted)]">/</span>
                          <span className="text-amber-600">{d.temp_max}&deg;</span>
                        </p>
                        {d.precipitation_prob && (
                          <p className="text-xs text-blue-500 mt-1 font-mono">{d.precipitation_prob}%</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-[var(--border-subtle)]">
                <a href="https://api.ipma.pt" target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[var(--accent-blue)] hover:underline font-mono">
                  Fonte: IPMA &rarr;
                </a>
              </div>
            </div>
          </Card>

          {/* ━━ Telecom Card ━━ */}
          <Card title="Comunicacoes" icon={<WifiIcon />}
            accentColor={telecomStatus === "warning" ? "amber" : telecomStatus === "critical" ? "red" : "none"}
            headerRight={<StatusBadge status={telecomStatus as any} />}>
            <div className="tab-bar mb-5">
              {([["leiria", "Leiria"], ["operators", "Operadores"], ["district", "Distrito"]] as const).map(([key, label]) => (
                <button key={key} className={`tab-btn ${telecomTab === key ? "active" : ""}`} onClick={() => setTelecomTab(key)}>{label}</button>
              ))}
            </div>

            {telecomTab === "leiria" && (
              <div className="space-y-4 animate-fade-in">
                {telecom?.meo_availability?.leiria_concelho ? (
                  <div className="p-5 rounded-xl bg-blue-50 border border-blue-200">
                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-4">Concelho de Leiria — MEO</p>
                    <div className="grid grid-cols-2 gap-6">
                      {([
                        { label: "Rede Movel", pct: telecom.meo_availability.leiria_concelho.rede_movel_pct, forecast: telecom.meo_availability.leiria_concelho.rede_movel_previsao },
                        { label: "Rede Fixa", pct: telecom.meo_availability.leiria_concelho.rede_fixa_pct, forecast: telecom.meo_availability.leiria_concelho.rede_fixa_previsao },
                      ] as const).map((item) => (
                        <div key={item.label} className="text-center">
                          <p className="text-5xl font-bold font-mono leading-none" style={{ color: pctColor(item.pct) }}>
                            {item.pct ?? "—"}<span className="text-2xl">%</span>
                          </p>
                          <p className="text-sm text-[var(--text-secondary)] mt-2">{item.label}</p>
                          <p className="text-xs font-mono text-[var(--text-muted)] mt-1">{item.forecast}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)] text-center py-6">Sem dados MEO para Leiria</p>
                )}

                {telecom?.operator_incidents && telecom.operator_incidents.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold mb-3">Incidentes Ativos</h4>
                    <div className="space-y-2">
                      {telecom.operator_incidents.map((inc, i) => (
                        <a key={i} href={inc.source_url} target="_blank" rel="noopener noreferrer"
                          className="block p-3 rounded-xl bg-red-50 border border-red-200 hover:bg-red-100 transition-all group">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-white border" style={{
                              borderColor: inc.operator === "NOS" ? "#ff660040" : inc.operator === "Vodafone" ? "#e6000040" : "#3182ce40",
                              color: inc.operator === "NOS" ? "#cc5500" : inc.operator === "Vodafone" ? "#cc0000" : "#3182ce",
                            }}>{inc.operator}</span>
                            <span className="text-sm font-medium text-red-800">{inc.title}</span>
                          </div>
                          {inc.description && <p className="text-xs text-red-600 mt-1.5 line-clamp-2">{inc.description}</p>}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {telecomTab === "operators" && (
              <div className="space-y-4 animate-fade-in">
                {telecom?.operators && (
                  <div className="space-y-1.5">
                    {telecom.operators.map((op, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${op.reachable ? "bg-emerald-500" : "bg-red-500"}`} />
                          <span className="font-medium text-[var(--text-primary)]">{op.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {op.response_time_ms != null && (
                            <span className="text-xs font-mono text-[var(--text-muted)]">{op.response_time_ms}ms</span>
                          )}
                          <StatusBadge status={op.reachable ? "ok" : "critical"} label={op.reachable ? "Online" : "Offline"} pulse={false} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {telecom?.kristin_impact && (
                  <Collapsible title="Impacto Kristin (ANACOM)" defaultOpen>
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                      <p className="text-sm text-amber-900">
                        <span className="text-2xl font-bold font-mono text-amber-700">{telecom.kristin_impact.last_known_affected_clients.toLocaleString("pt-PT")}</span>{" "}
                        clientes afetados a {formatDate(telecom.kristin_impact.last_known_date)}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {telecom.kristin_impact.most_affected_areas.map((area, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-md bg-white text-xs text-amber-700 border border-amber-200">{area}</span>
                        ))}
                      </div>
                    </div>
                  </Collapsible>
                )}

                {telecom?.tips && (
                  <Collapsible title="Dicas">
                    <div className="space-y-2">
                      {Object.entries(telecom.tips).map(([key, val]) => (
                        <p key={key} className="text-sm text-[var(--text-secondary)] pl-3 border-l-2 border-blue-300">{val}</p>
                      ))}
                    </div>
                  </Collapsible>
                )}
              </div>
            )}

            {telecomTab === "district" && (
              <div className="space-y-4 animate-fade-in">
                {telecom?.meo_availability?.global && (
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { label: "Rede Fixa", pct: telecom.meo_availability.global.rede_fixa_pct, forecast: telecom.meo_availability.global.rede_fixa_previsao_95 },
                      { label: "Rede Movel", pct: telecom.meo_availability.global.rede_movel_pct, forecast: telecom.meo_availability.global.rede_movel_previsao_95 },
                    ] as const).map((item) => (
                      <div key={item.label} className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-center">
                        <p className="text-2xl font-bold font-mono" style={{ color: pctColor(item.pct) }}>
                          {item.pct ?? "—"}%
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">{item.label} (global)</p>
                        <p className="text-xs font-mono text-[var(--text-muted)]">95% ate {item.forecast}</p>
                      </div>
                    ))}
                  </div>
                )}

                {telecom?.meo_availability?.leiria_district && telecom.meo_availability.leiria_district.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[var(--bg-elevated)]">
                          <th className="text-left py-2.5 px-3 text-xs text-[var(--text-muted)] font-medium">Concelho</th>
                          <th className="text-right py-2.5 px-3 text-xs text-[var(--text-muted)] font-medium">Fixa</th>
                          <th className="text-right py-2.5 px-3 text-xs text-[var(--text-muted)] font-medium">Movel</th>
                          <th className="text-right py-2.5 px-3 text-xs text-[var(--text-muted)] font-medium">Previsao</th>
                        </tr>
                      </thead>
                      <tbody>
                        {telecom.meo_availability.leiria_district
                          .sort((a, b) => (a.rede_movel_pct ?? 100) - (b.rede_movel_pct ?? 100))
                          .map((c, i) => (
                          <tr key={i} className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)]">
                            <td className="py-2.5 px-3 font-medium text-[var(--text-primary)]">{c.concelho}</td>
                            <td className="py-2.5 px-3 text-right font-mono" style={{ color: pctColor(c.rede_fixa_pct) }}>{c.rede_fixa_pct ?? "—"}%</td>
                            <td className="py-2.5 px-3 text-right font-mono" style={{ color: pctColor(c.rede_movel_pct) }}>{c.rede_movel_pct ?? "—"}%</td>
                            <td className="py-2.5 px-3 text-right text-xs font-mono text-[var(--text-muted)]">
                              {c.rede_movel_previsao.includes("95%") ? "OK" : c.rede_movel_previsao.replace("Disponibilidade >= 95%", "OK")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {telecom?.meo_availability?.source_url && (
                  <a href={telecom.meo_availability.source_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-[var(--accent-blue)] hover:underline font-mono inline-block">
                    Fonte: MEO Disponibilidade &rarr;
                  </a>
                )}
              </div>
            )}

            <div className="mt-5 pt-4 border-t border-[var(--border-subtle)]">
              <a href="https://www.anacom.pt" target="_blank" rel="noopener noreferrer"
                className="text-xs text-[var(--accent-blue)] hover:underline font-mono">
                Fonte: ANACOM + connectivity checks &rarr;
              </a>
            </div>
          </Card>

          {/* ━━ Water Card ━━ */}
          <Card title="Agua" icon={<DropletIcon />} accentColor={waterStatus === "warning" ? "amber" : "blue"} headerRight={<StatusBadge status={waterStatus as any} />}>
            <div className="space-y-4">
              {water?.smas_website && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">SMAS Leiria</p>
                    <p className="text-xs text-[var(--text-muted)]">Portal web</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {water.smas_website.response_time_ms != null && (
                      <span className="text-xs font-mono text-[var(--text-muted)]">{water.smas_website.response_time_ms}ms</span>
                    )}
                    <StatusBadge status={water.smas_website.reachable ? "ok" : "critical"} label={water.smas_website.reachable ? "Online" : "Offline"} pulse={false} />
                  </div>
                </div>
              )}

              {water?.announcements && water.announcements.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">Comunicados SMAS</h4>
                  <div className="space-y-2">
                    {water.announcements.map((a) => (
                      <a key={a.id} href={a.link} target="_blank" rel="noopener noreferrer"
                        className="block p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-blue-300 hover:shadow-sm transition-all group">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium group-hover:text-[var(--accent-blue)] transition-colors text-[var(--text-primary)]">{a.title}</p>
                          <span className="text-xs font-mono text-[var(--text-muted)] shrink-0">{formatDate(a.date)}</span>
                        </div>
                        {a.excerpt && <p className="text-sm text-[var(--text-muted)] mt-1 line-clamp-2">{a.excerpt}</p>}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {water?.kristin_impact && (
                <Collapsible title="Impacto Kristin">
                  <div className="p-4 rounded-xl bg-cyan-50 border border-cyan-200">
                    <p className="text-sm text-[var(--text-secondary)] mb-3">{water.kristin_impact.note}</p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {water.kristin_impact.affected_areas.map((area, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md bg-white text-xs text-cyan-700 border border-cyan-200">{area}</span>
                      ))}
                    </div>
                    <div className="space-y-2 text-sm">
                      <p className="text-amber-700"><span className="font-semibold">DGS:</span> {water.kristin_impact.dgs_advisory}</p>
                      <p className="text-cyan-700"><span className="font-semibold">ERSAR:</span> {water.kristin_impact.ersar_advisory}</p>
                    </div>
                  </div>
                </Collapsible>
              )}

              {water?.contacts?.smas_leiria && (
                <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Contactos</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <p><span className="text-[var(--text-muted)]">Geral: </span><span className="font-mono text-[var(--accent-blue)]">{water.contacts.smas_leiria.phone}</span></p>
                    <p><span className="text-[var(--text-muted)]">Emergencia: </span><span className="font-mono text-red-600 font-semibold">{water.contacts.smas_leiria.emergency}</span></p>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-[var(--border-subtle)]">
                <a href="https://www.smas-leiria.pt" target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[var(--accent-blue)] hover:underline font-mono">
                  Fonte: SMAS Leiria + ERSAR &rarr;
                </a>
              </div>
            </div>
          </Card>
        </div>

        {/* ━━ Recovery Card — full width ━━ */}
        {recovery?.success && (
          <Card title="Reerguer Leiria" icon={<HeartIcon />} accentColor={recoveryStatus === "ok" ? "green" : "amber"} headerRight={<StatusBadge status={recoveryStatus as any} />}>
            <div className="space-y-5">
              {/* Calamity banner */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 rounded-xl bg-rose-50 border border-rose-200">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-700 bg-rose-100 px-2 py-0.5 rounded border border-rose-200">{recovery.calamity?.status}</span>
                <span className="text-sm text-rose-700">ate {formatDate(recovery.summary.calamity_until)}</span>
                <span className="text-rose-300">&bull;</span>
                <span className="text-sm text-rose-700">{recovery.summary.municipalities_affected} concelhos</span>
                <span className="text-rose-300">&bull;</span>
                <span className="text-sm font-mono font-bold text-rose-800">{recovery.summary.total_support_package}</span>
              </div>

              {/* Gabinete */}
              {recovery.gabinete && (
                <div className="p-5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <h4 className="font-semibold text-rose-700">{recovery.gabinete.name}</h4>
                      <p className="text-sm text-[var(--text-secondary)] mt-1">{recovery.gabinete.location}</p>
                      <p className="text-sm text-[var(--text-secondary)]">Horario: {recovery.gabinete.schedule}</p>
                      <p className="text-sm text-[var(--text-muted)] mt-1">
                        {recovery.gabinete.num_counters} balcoes &bull;{" "}
                        <span className="text-[var(--accent-blue)] font-medium">{recovery.gabinete.first_day_visitors} pessoas no 1&ordm; dia</span>
                      </p>
                    </div>
                    <a href={`mailto:${recovery.gabinete.email}`}
                      className="text-xs px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 transition-colors font-mono">
                      {recovery.gabinete.email}
                    </a>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {recovery.gabinete.areas.map((area, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-md bg-white text-xs text-[var(--text-muted)] border border-[var(--border-subtle)]">{area}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Platforms */}
              <div>
                <h4 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">Plataformas de Apoio</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {recovery.platforms.map((p) => (
                    <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-blue-300 hover:shadow-sm transition-all group">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate group-hover:text-[var(--accent-blue)] transition-colors text-[var(--text-primary)]">{p.name}</p>
                        <p className="text-xs text-[var(--text-muted)] truncate">{p.description}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-3 shrink-0">
                        {p.response_time_ms != null && <span className="text-xs font-mono text-[var(--text-muted)]">{p.response_time_ms}ms</span>}
                        <span className={`w-2.5 h-2.5 rounded-full ${p.reachable ? "bg-emerald-500" : "bg-red-500"}`} />
                      </div>
                    </a>
                  ))}
                </div>
              </div>

              {/* Support areas */}
              <Collapsible title="Apoios disponiveis" defaultOpen>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {recovery.support_areas.map((area) => (
                    <div key={area.id} className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                      <h5 className="font-semibold mb-3 flex items-center gap-2 text-[var(--text-primary)]">
                        <span>{area.icon}</span><span>{area.title}</span>
                      </h5>
                      <div className="space-y-2">
                        {area.supports.map((s, i) => (
                          <div key={i} className="p-3 rounded-lg bg-white border border-[var(--border-subtle)]">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-semibold text-[var(--accent-blue)]">{s.name}</p>
                              {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--accent-blue)] hover:underline shrink-0">Abrir &rarr;</a>}
                            </div>
                            <p className="text-sm text-[var(--text-secondary)] mt-1">{s.description}</p>
                            <p className="text-xs text-[var(--text-muted)] mt-1">via {s.platform}</p>
                            {s.docs_required.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {s.docs_required.map((doc, j) => (
                                  <span key={j} className="px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200">{doc}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Collapsible>

              {recovery.calamity?.structure_mission && (
                <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                  <p className="text-sm text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">{recovery.calamity.structure_mission.name}</span>{" "}
                    — Coord. {recovery.calamity.structure_mission.coordinator}, sediada em {recovery.calamity.structure_mission.hq} desde {formatDate(recovery.calamity.structure_mission.started)}
                  </p>
                </div>
              )}

              <div className="pt-4 border-t border-[var(--border-subtle)]">
                <div className="flex flex-wrap gap-4">
                  {[
                    ["https://www.cm-leiria.pt", "CM Leiria"],
                    ["https://estragos.pt", "Estragos.pt"],
                    ["https://www.ccdrc.pt/pt/areas-de-atuacao/administracao-local/apoio-tecnico-e-financeiro/tempestades-2026/", "CCDR Centro"],
                    ["https://www.bfrm.pt", "Banco Fomento"],
                  ].map(([url, label]) => (
                    <a key={label} href={url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-[var(--accent-blue)] hover:underline font-mono">{label} &rarr;</a>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ── Footer ── */}
        <footer className="text-center py-8">
          <p className="text-sm text-[var(--text-muted)]">Leiria Monitor &middot; Atualizado a cada 5 minutos</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            E-Redes &middot; IPMA &middot; MEO &middot; ANACOM &middot; SMAS Leiria &middot; ERSAR &middot; Reerguer Leiria
          </p>
        </footer>
      </main>
    </div>
  );
}
