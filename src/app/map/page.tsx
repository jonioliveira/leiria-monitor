"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportPanel } from "@/components/report-panel";
import type { InfraContext } from "@/components/report-panel";
import {
  MapPin, Radio, Activity, MessageSquarePlus, Check, LocateFixed,
  Search, Zap, Wifi, Globe, Droplets, Construction, ThumbsUp, CheckCircle, Map, List, Share2,
} from "lucide-react";
import type {
  TransformerMarker,
  AntennaFeature,
  Report,
  Hotspot,
  InfraReportContext,
  PoleMarker,
} from "@/components/unified-map";

function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

function isStale(r: Report): boolean {
  const now = Date.now();
  const ageMs = now - new Date(r.createdAt).getTime();
  if (ageMs < 48 * 60 * 60 * 1000) return false;
  if (!r.lastUpvotedAt) return true;
  return now - new Date(r.lastUpvotedAt).getTime() > 24 * 60 * 60 * 1000;
}

const UnifiedMap = dynamic(
  () => import("@/components/unified-map").then((mod) => mod.UnifiedMap),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> }
);

const ALL_LAYERS = ["transformers", "antennas", "reports", "poles"] as const;
const LAYER_LABELS: Record<string, { label: string; icon: typeof Radio }> = {
  transformers: { label: "PTDs", icon: Activity },
  antennas: { label: "Antenas", icon: Radio },
  reports: { label: "Reportes", icon: MessageSquarePlus },
  poles: { label: "Postes BT", icon: Zap },
};

const ALL_OPERATORS = ["MEO", "NOS", "Vodafone", "DIGI"];
const OPERATOR_COLORS: Record<string, string> = {
  MEO: "#00a3e0",
  NOS: "#ff6600",
  Vodafone: "#e60000",
  DIGI: "#003087",
};

/** Find nearest transformer municipality for a report's coordinates */
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

type ViewMode = "map" | "list";

export default function MapaPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[80vh] w-full" />}>
      <MapaPageInner />
    </Suspense>
  );
}

function MapaPageInner() {
  const searchParams = useSearchParams();
  const [transformers, setTransformers] = useState<TransformerMarker[]>([]);
  const [antennas, setAntennas] = useState<AntennaFeature[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [poles, setPoles] = useState<PoleMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("map");
  const [mapBounds, setMapBounds] = useState<{ minLat: number; maxLat: number; minLng: number; maxLng: number } | null>(null);
  const [mapZoom, setMapZoom] = useState(10);
  const poleFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [shareToast, setShareToast] = useState(false);
  const deepLinkHandled = useRef(false);

  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(
    new Set(["transformers", "antennas", "reports"])
  );
  const [visibleOperators, setVisibleOperators] = useState<Set<string>>(
    new Set(ALL_OPERATORS)
  );

  // Report panel state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLat, setReportLat] = useState<number | null>(null);
  const [reportLng, setReportLng] = useState<number | null>(null);
  const [infraContext, setInfraContext] = useState<InfraContext | null>(null);

  // Report list state
  const [listSearch, setListSearch] = useState("");

  // Enrich reports with concelho and sort by priority then recency
  const enrichedReports = useMemo(() => {
    const priorityOrder = { urgente: 0, importante: 1, normal: 2 };
    return reports
      .map((r) => ({
        ...r,
        concelho: r.parish ? resolveReportConcelho(r, transformers) : resolveReportConcelho(r, transformers),
      }))
      .sort((a, b) => {
        const pa = priorityOrder[a.priority ?? "normal"] ?? 2;
        const pb = priorityOrder[b.priority ?? "normal"] ?? 2;
        if (pa !== pb) return pa - pb;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [reports, transformers]);

  // Get unique concelhos for quick filter
  const concelhos = useMemo(() => {
    const set = new Set(enrichedReports.map((r) => r.concelho));
    return Array.from(set).sort();
  }, [enrichedReports]);

  const filteredReports = useMemo(() => {
    if (!listSearch) return enrichedReports;
    const q = listSearch.toLowerCase();
    return enrichedReports.filter((r) =>
      r.concelho.toLowerCase().includes(q) ||
      (r.parish?.toLowerCase().includes(q)) ||
      (r.street?.toLowerCase().includes(q)) ||
      (r.description?.toLowerCase().includes(q)) ||
      (r.operator?.toLowerCase().includes(q)) ||
      (r.type === "electricity" && ("sem luz".includes(q) || "poste caído".includes(q))) ||
      (r.type === "telecom_mobile" && "sem rede móvel".includes(q)) ||
      (r.type === "telecom_fixed" && "sem rede fixa".includes(q)) ||
      (r.type === "water" && "sem água".includes(q)) ||
      (r.type === "roads" && "estrada cortada".includes(q))
    );
  }, [enrichedReports, listSearch]);

  // Group filtered reports by concelho → parish
  const groupedReports = useMemo(() => {
    const map: Record<string, Record<string, (typeof filteredReports)[number][]>> = {};
    for (const r of filteredReports) {
      const conc = r.concelho;
      const parish = r.parish ?? "Sem freguesia";
      if (!map[conc]) map[conc] = {};
      const parishMap = map[conc];
      if (!parishMap[parish]) parishMap[parish] = [];
      parishMap[parish].push(r);
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([conc, parishes]) => ({
        concelho: conc,
        parishes: Object.entries(parishes).sort(([a], [b]) => a.localeCompare(b)),
        total: Object.values(parishes).reduce((s, arr) => s + arr.length, 0),
      }));
  }, [filteredReports]);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch("/api/reports");
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports ?? []);
        setHotspots(data.hotspots ?? []);
      }
    } catch { /* silent */ }
  }, []);

  const handleBoundsChange = useCallback((bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }) => {
    setMapBounds(bounds);
    const latSpan = bounds.maxLat - bounds.minLat;
    const estimatedZoom = latSpan > 0 ? Math.round(Math.log2(180 / latSpan)) : 10;
    setMapZoom(estimatedZoom);
  }, []);

  function handleLocate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setFlyTo({ ...loc, zoom: 15 });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleShare(id: number) {
    const url = `${window.location.origin}/map?report=${id}`;
    if (navigator.share) {
      navigator.share({ title: "Rede Sentinela — Reporte", url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2000);
      });
    }
  }

  // Deep link: ?report=123
  useEffect(() => {
    if (deepLinkHandled.current) return;
    const reportId = searchParams.get("report");
    if (!reportId || reports.length === 0) return;

    const target = reports.find((r) => r.id === Number(reportId));
    if (target) {
      deepLinkHandled.current = true;
      setFlyTo({ lat: target.lat, lng: target.lng, zoom: 16 });
    }
  }, [searchParams, reports]);

  // Debounced pole fetching when layer is visible and zoom >= 14
  useEffect(() => {
    if (!visibleLayers.has("poles") || !mapBounds || mapZoom < 14) {
      setPoles([]);
      return;
    }

    if (poleFetchTimer.current) clearTimeout(poleFetchTimer.current);
    poleFetchTimer.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          minLat: String(mapBounds.minLat),
          maxLat: String(mapBounds.maxLat),
          minLng: String(mapBounds.minLng),
          maxLng: String(mapBounds.maxLng),
        });
        const res = await fetch(`/api/electricity/poles?${params}`);
        if (res.ok) {
          const data = await res.json();
          setPoles(data.poles ?? []);
        }
      } catch { /* silent */ }
    }, 500);

    return () => {
      if (poleFetchTimer.current) clearTimeout(poleFetchTimer.current);
    };
  }, [visibleLayers, mapBounds, mapZoom]);

  useEffect(() => {
    async function load() {
      try {
        const [reportsRes, ptdRes, antRes] = await Promise.allSettled([
          fetch("/api/reports"),
          fetch("/api/electricity/transformers"),
          fetch("/api/antennas"),
        ]);

        if (reportsRes.status === "fulfilled" && reportsRes.value.ok) {
          const reportsData = await reportsRes.value.json();
          setReports(reportsData.reports ?? []);
          setHotspots(reportsData.hotspots ?? []);
        }

        if (ptdRes.status === "fulfilled" && ptdRes.value.ok) {
          const ptdData = await ptdRes.value.json();
          setTransformers(ptdData.transformers ?? []);
        }

        if (antRes.status === "fulfilled" && antRes.value.ok) {
          const antData = await antRes.value.json();
          setAntennas(antData.antennas ?? []);
        }
      } catch {
        // silent fail
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  function toggleLayer(layer: string) {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }

  function toggleOperator(op: string) {
    setVisibleOperators((prev) => {
      const next = new Set(prev);
      if (next.has(op)) next.delete(op);
      else next.add(op);
      return next;
    });
  }

  function handleMapClick(lat: number, lng: number) {
    setInfraContext(null);
    setReportLat(lat);
    setReportLng(lng);
    setReportOpen(true);
  }

  function handleReportInfra(ctx: InfraReportContext) {
    setReportLat(ctx.lat);
    setReportLng(ctx.lng);
    setInfraContext({
      label: ctx.label,
      type: ctx.type,
      operator: ctx.operator,
      details: ctx.details,
    });
    setReportOpen(true);
  }

  async function handleUpvote(id: number) {
    try {
      await fetch("/api/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "upvote" }),
      });
      setReports((prev) =>
        prev.map((r) => (r.id === id ? { ...r, upvotes: r.upvotes + 1, lastUpvotedAt: new Date().toISOString() } : r))
      );
    } catch { /* silent */ }
  }

  async function handleResolve(id: number) {
    try {
      await fetch("/api/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "resolve" }),
      });
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch { /* silent */ }
  }

  if (loading) {
    return (
      <div className="h-full">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Share toast */}
      {shareToast && (
        <div className="fixed top-4 left-1/2 z-[2000] -translate-x-1/2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
          Link copiado!
        </div>
      )}

      {/* View toggle bar */}
      <div className="flex items-center justify-between border-b border-border bg-background px-4 py-2">
        <div className="flex gap-1">
          <button
            onClick={() => setView("map")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "map"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <Map className="h-4 w-4" />
            Mapa
          </button>
          <button
            onClick={() => setView("list")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "list"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            <List className="h-4 w-4" />
            Reportes
            {reports.length > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                view === "list" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary"
              }`}>
                {reports.length}
              </span>
            )}
          </button>
        </div>

        {view === "map" && (
          <button
            onClick={() => { setView("map"); setReportOpen(true); }}
            className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
          >
            <MapPin className="h-3.5 w-3.5" />
            Reportar
          </button>
        )}
      </div>

      {/* ── Map view ─────────────────────────────────────── */}
      {view === "map" && (
        <div className="relative flex-1">
          <UnifiedMap
            layers={{ transformers, antennas, reports, poles, hotspots }}
            visibleLayers={visibleLayers}
            visibleOperators={visibleOperators}
            onMapClick={handleMapClick}
            onReportInfra={handleReportInfra}
            onUpvote={handleUpvote}
            onResolve={handleResolve}
            onShare={handleShare}
            onBoundsChange={handleBoundsChange}
            clickedPosition={reportLat != null && reportLng != null ? { lat: reportLat, lng: reportLng } : null}
            userLocation={userLocation}
            flyTo={flyTo}
          />

          {/* Zoom gate message for poles layer */}
          {visibleLayers.has("poles") && mapZoom < 14 && (
            <div className="absolute bottom-20 left-1/2 z-[1000] -translate-x-1/2 rounded-lg bg-background/90 border border-border px-4 py-2 text-sm text-muted-foreground shadow-md backdrop-blur-sm">
              Aproxime o mapa para ver os postes BT
            </div>
          )}

          {/* Top controls container — stacks layer bar, operator filters, and locate button without overlap */}
          <div className="absolute left-3 right-3 top-3 z-[1000] flex flex-col gap-1.5">
            {/* Layer toggle bar */}
            <div className="flex flex-wrap gap-1.5">
              {ALL_LAYERS.map((layer) => {
                const active = visibleLayers.has(layer);
                const cfg = LAYER_LABELS[layer];
                const Icon = cfg.icon;
                return (
                  <button
                    key={layer}
                    onClick={() => toggleLayer(layer)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-md transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-background/90 text-muted-foreground hover:bg-accent border border-border"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            {/* Operator filter — only when antennas visible */}
            {visibleLayers.has("antennas") && (
              <div className="flex flex-wrap gap-1.5">
                {ALL_OPERATORS.map((op) => {
                  const active = visibleOperators.has(op);
                  const color = OPERATOR_COLORS[op];
                  return (
                    <button
                      key={op}
                      onClick={() => toggleOperator(op)}
                      className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium shadow-md border transition-colors backdrop-blur-sm"
                      style={{
                        borderColor: active ? color : "var(--border)",
                        background: active ? `${color}22` : "var(--background)",
                        color: active ? color : "var(--muted-foreground)",
                      }}
                    >
                      {active && <Check className="h-3 w-3" />}
                      {op}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Locate me button */}
            <div className="flex">
              <button
                onClick={handleLocate}
                disabled={locating}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-md transition-colors ${
                  userLocation
                    ? "bg-blue-500 text-white"
                    : "bg-background/90 text-muted-foreground hover:bg-accent border border-border"
                }`}
              >
                <LocateFixed className={`h-3.5 w-3.5 ${locating ? "animate-spin" : ""}`} />
                {locating ? "A localizar..." : "A minha localização"}
              </button>
            </div>
          </div>

          {/* Report panel */}
          <ReportPanel
            lat={reportLat}
            lng={reportLng}
            open={reportOpen}
            onClose={() => { setReportOpen(false); setReportLat(null); setReportLng(null); setInfraContext(null); }}
            onSubmitted={fetchReports}
            infraContext={infraContext}
          />
        </div>
      )}

      {/* ── Report list view ─────────────────────────────── */}
      {view === "list" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Search + concelho quick filters */}
          <div className="border-b border-border bg-background px-4 py-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="Pesquisar por concelho, freguesia, rua, descrição..."
                className="w-full rounded-lg border border-border bg-input pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
              />
            </div>
            {concelhos.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {concelhos.map((c) => {
                  const isActive = listSearch.toLowerCase() === c.toLowerCase();
                  return (
                    <button
                      key={c}
                      onClick={() => setListSearch(isActive ? "" : c)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:bg-accent"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Report list */}
          <div className="flex-1 overflow-y-auto">
            {filteredReports.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <MessageSquarePlus className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {reports.length === 0 ? "Sem reportes de momento" : "Nenhum resultado para a pesquisa"}
                </p>
              </div>
            ) : (
              groupedReports.map(({ concelho, parishes, total }) => (
                <div key={concelho}>
                  {/* Concelho header */}
                  <div className="sticky top-0 z-10 border-b border-border bg-muted/50 px-4 py-1.5 backdrop-blur-sm">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {concelho} ({total})
                    </p>
                  </div>

                  {parishes.map(([parish, items]) => (
                    <div key={`${concelho}-${parish}`}>
                      {/* Parish sub-header */}
                      {parish !== "Sem freguesia" && (
                        <div className="border-b border-border/30 bg-muted/20 px-6 py-1">
                          <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                            {parish}
                          </p>
                        </div>
                      )}

                      {/* Reports in this parish */}
                      {items.map((r) => (
                        <div
                          key={r.id}
                          className={`flex items-start gap-3 border-b border-border/50 px-4 py-3 ${
                            isStale(r) ? "opacity-60" : ""
                          }`}
                        >
                          {/* Type icon */}
                          <div className="mt-0.5 shrink-0 rounded-full bg-muted p-2">
                            {r.type === "electricity" ? (
                              <Zap className="h-4 w-4 text-amber-400" />
                            ) : r.type === "telecom_mobile" ? (
                              <Wifi className="h-4 w-4 text-blue-400" />
                            ) : r.type === "telecom_fixed" ? (
                              <Globe className="h-4 w-4 text-indigo-400" />
                            ) : r.type === "roads" ? (
                              <Construction className="h-4 w-4 text-orange-400" />
                            ) : (
                              <Droplets className="h-4 w-4 text-cyan-400" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground">
                                {r.type === "electricity" ? (r.description?.includes("[POSTE CAÍDO COM CORRENTE]") ? "Poste caído (com corrente)" : r.description?.includes("[POSTE CAÍDO]") ? "Poste caído" : "Sem luz") : r.type === "telecom_mobile" ? `Sem rede móvel${r.operator ? ` ${r.operator}` : ""}` : r.type === "telecom_fixed" ? `Sem rede fixa${r.operator ? ` ${r.operator}` : ""}` : r.type === "roads" ? "Estrada cortada" : "Sem água"}
                              </p>
                              {r.priority && r.priority !== "normal" && (
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none text-white ${
                                  r.priority === "urgente" ? "bg-red-500" : "bg-orange-500"
                                }`}>
                                  {r.priority === "urgente" ? "Urgente" : "Importante"}
                                </span>
                              )}
                            </div>
                            {r.street && (
                              <p className="text-xs text-muted-foreground mt-0.5">{r.street}</p>
                            )}
                            {r.description && (
                              <p className="text-xs text-foreground/80 mt-1">{r.description.replace(/\[POSTE CAÍDO(?:\s+COM CORRENTE)?\]\s*/g, "")}</p>
                            )}
                            {r.imageUrl && (
                              <img
                                src={r.imageUrl}
                                alt=""
                                className="mt-1.5 h-16 w-24 rounded object-cover border border-border"
                              />
                            )}
                            <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{timeAgo(r.createdAt)}</span>
                              <span>{r.upvotes} confirmação{r.upvotes !== 1 ? "ões" : ""}</span>
                            </div>
                            {isStale(r) && (
                              <p className="mt-0.5 text-[10px] text-amber-500">Sem confirmação recente</p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                            <button
                              onClick={() => handleUpvote(r.id)}
                              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-blue-400/10"
                            >
                              <ThumbsUp className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Confirmo</span>
                            </button>
                            <button
                              onClick={() => handleResolve(r.id)}
                              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-400/10"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Resolvido</span>
                            </button>
                            <button
                              onClick={() => handleShare(r.id)}
                              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
                            >
                              <Share2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
