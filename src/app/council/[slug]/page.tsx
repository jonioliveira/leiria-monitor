"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Zap,
  Wifi,
  Globe,
  Droplets,
  Construction,
  ArrowLeft,
  ChevronRight,
  ThumbsUp,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { parseConcelhoSlug, slugify } from "@/lib/slug-utils";
import type { AreaDashboardData } from "@/lib/types";

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Zap; color: string }> = {
  electricity: { label: "Eletricidade", icon: Zap, color: "text-amber-400" },
  telecom_mobile: { label: "Rede Móvel", icon: Wifi, color: "text-blue-400" },
  telecom_fixed: { label: "Rede Fixa", icon: Globe, color: "text-indigo-400" },
  water: { label: "Água", icon: Droplets, color: "text-cyan-400" },
  roads: { label: "Estradas", icon: Construction, color: "text-orange-400" },
};

function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

function statusFromCount(count: number): "critical" | "warning" | "ok" {
  if (count > 5) return "critical";
  if (count > 0) return "warning";
  return "ok";
}

const STATUS_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  ok: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  critical: "Crítico",
  warning: "Degradado",
  ok: "Operacional",
};

export default function ConcelhoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ConcelhoPageInner slug={slug} />
    </Suspense>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 rounded-lg" />
      <div className="grid grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function ConcelhoPageInner({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const parish = searchParams.get("parish");
  const concelhoName = parseConcelhoSlug(slug);

  const [data, setData] = useState<AreaDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      try {
        const params = new URLSearchParams({ concelho: concelhoName ?? slug });
        if (parish) params.set("parish", parish);
        const res = await fetch(`/api/dashboard/area?${params}`);
        if (res.ok) setData(await res.json());
      } catch {
        // silent
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [concelhoName, slug, parish]
  );

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!concelhoName) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-lg font-semibold text-foreground">Concelho não encontrado</p>
        <Link href="/" className="text-sm text-primary hover:underline">
          Voltar ao início
        </Link>
      </div>
    );
  }

  if (loading) return <LoadingSkeleton />;

  const status = statusFromCount(data?.reports.total ?? 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">
          Início
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        {parish ? (
          <>
            <Link
              href={`/council/${slug}`}
              className="hover:text-foreground transition-colors"
            >
              {concelhoName}
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground font-medium">{parish}</span>
          </>
        ) : (
          <span className="text-foreground font-medium">{concelhoName}</span>
        )}
      </nav>

      {/* Hero */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {parish ? `${parish} — ${concelhoName}` : concelhoName}
          </h1>
          <div className="mt-2 flex items-center gap-3">
            <Badge
              variant="outline"
              className={STATUS_COLORS[status]}
            >
              {STATUS_LABELS[status]}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {data?.reports.total ?? 0} reportes ativos
              {!parish && data?.reports.parishes && data.reports.parishes.length > 0 && (
                <> · {data.reports.parishes.length} freguesias afetadas</>
              )}
            </span>
          </div>
          {data?.transformers && data.transformers.total > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {data.transformers.total} postos de transformação no concelho
            </p>
          )}
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>
      </div>

      {/* Type breakdown */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
          const Icon = cfg.icon;
          const count = data?.reports.byType[type] ?? 0;
          return (
            <Card key={type} className="overflow-hidden">
              <CardContent className="flex flex-col items-center gap-1.5 py-4">
                <Icon className={`h-5 w-5 ${cfg.color}`} />
                <p className="text-xl font-bold text-foreground">{count}</p>
                <p className="text-[11px] text-muted-foreground text-center leading-tight">
                  {cfg.label}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Parish grid (concelho view only) */}
      {!parish && data?.parishes && data.parishes.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Freguesias ({data.parishes.length})
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {data.parishes.map((p) => {
              const hasReports = data.reports.parishes.includes(p);
              return (
                <button
                  key={p}
                  onClick={() =>
                    router.push(`/council/${slug}?parish=${encodeURIComponent(p)}`)
                  }
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      hasReports ? "bg-amber-400" : "bg-emerald-400"
                    }`}
                  />
                  <span className="truncate text-foreground">{p}</span>
                  <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Back to concelho link (parish view only) */}
      {parish && (
        <Link
          href={`/council/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Ver todo o concelho de {concelhoName}
        </Link>
      )}

      {/* Recent reports */}
      {data?.recentReports && data.recentReports.length > 0 ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Reportes recentes
          </h2>
          <div className="space-y-2">
            {data.recentReports.map((r) => {
              const cfg = TYPE_CONFIG[r.type] ?? TYPE_CONFIG.electricity;
              const Icon = cfg.icon;
              return (
                <Card key={r.id} className="overflow-hidden">
                  <CardContent className="flex items-start gap-3 py-3">
                    <div className="mt-0.5 shrink-0 rounded-full bg-muted p-2">
                      <Icon className={`h-4 w-4 ${cfg.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {r.type === "electricity"
                            ? "Sem luz"
                            : r.type === "telecom_mobile"
                            ? `Sem rede móvel${r.operator ? ` ${r.operator}` : ""}`
                            : r.type === "telecom_fixed"
                            ? `Sem rede fixa${r.operator ? ` ${r.operator}` : ""}`
                            : r.type === "roads"
                            ? "Estrada cortada"
                            : "Sem água"}
                        </p>
                        {r.priority && r.priority !== "normal" && (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none text-white ${
                              r.priority === "urgente"
                                ? "bg-red-500"
                                : "bg-orange-500"
                            }`}
                          >
                            {r.priority === "urgente" ? "Urgente" : "Importante"}
                          </span>
                        )}
                      </div>
                      {r.parish && !parish && (
                        <p className="text-xs text-primary/80 mt-0.5">
                          <MapPin className="mr-0.5 inline h-3 w-3" />
                          {r.parish}
                        </p>
                      )}
                      {r.street && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {r.street}
                        </p>
                      )}
                      {r.description && (
                        <p className="text-xs text-foreground/80 mt-1">
                          {r.description.replace(
                            /\[POSTE CAÍDO(?:\s+COM CORRENTE)?\]\s*/g,
                            ""
                          )}
                        </p>
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
                        <span>
                          <ThumbsUp className="mr-0.5 inline h-3 w-3" />
                          {r.upvotes}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <MapPin className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            Sem reportes ativos {parish ? `em ${parish}` : `em ${concelhoName}`}
          </p>
        </div>
      )}
    </div>
  );
}
