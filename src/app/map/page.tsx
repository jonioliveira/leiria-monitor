"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Zap, Wifi, MessageSquarePlus, Activity } from "lucide-react";
import { MUNICIPALITY_COORDS, SUBSTATION_COORDS } from "@/lib/constants";

const InfrastructureMap = dynamic(
  () =>
    import("@/components/infrastructure-map").then(
      (mod) => mod.InfrastructureMap
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[500px] w-full rounded-lg" />,
  }
);

type Layer = "electricity" | "telecom" | "both";

interface MunicipalityData {
  name: string;
  lat: number;
  lng: number;
  outages: number;
  meo?: {
    rede_fixa_pct: number | null;
    rede_movel_pct: number | null;
    rede_fixa_previsao: string;
    rede_movel_previsao: string;
  } | null;
}

interface Report {
  id: number;
  type: "electricity" | "telecom";
  operator: string | null;
  description: string | null;
  street: string | null;
  lat: number;
  lng: number;
  upvotes: number;
  createdAt: string;
}

interface SubstationMarker {
  name: string;
  lat: number;
  lng: number;
  latestLoad: number | null;
}

interface TransformerMarker {
  lat: number;
  lng: number;
  kva: number;
  usage: string;
  clients: number;
  municipality: string;
}

export default function MapaPage() {
  const [municipalities, setMunicipalities] = useState<MunicipalityData[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [substations, setSubstations] = useState<SubstationMarker[]>([]);
  const [transformers, setTransformers] = useState<TransformerMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [layer, setLayer] = useState<Layer>("both");
  const [meoUpdated, setMeoUpdated] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [elecRes, telecomRes, reportsRes, subRes, ptdRes] = await Promise.allSettled([
          fetch("/api/electricity"),
          fetch("/api/telecom"),
          fetch("/api/reports"),
          fetch("/api/electricity/substations"),
          fetch("/api/electricity/transformers"),
        ]);

        // Build outage map from electricity API
        const outageMap: Record<string, number> = {};
        if (elecRes.status === "fulfilled" && elecRes.value.ok) {
          const elecData = await elecRes.value.json();
          const records = elecData?.leiria?.active_outages?.records ?? [];
          for (const r of records) {
            outageMap[r.municipality] = (outageMap[r.municipality] ?? 0) + r.count;
          }
        }

        // Build telecom map from MEO availability
        const meoMap: Record<
          string,
          {
            rede_fixa_pct: number | null;
            rede_movel_pct: number | null;
            rede_fixa_previsao: string;
            rede_movel_previsao: string;
          }
        > = {};
        if (telecomRes.status === "fulfilled" && telecomRes.value.ok) {
          const telecomData = await telecomRes.value.json();
          setMeoUpdated(telecomData?.meo_availability?.last_updated ?? null);
          const concelhos = telecomData?.meo_availability?.leiria_district ?? [];
          for (const c of concelhos) {
            meoMap[c.concelho] = {
              rede_fixa_pct: c.rede_fixa_pct,
              rede_movel_pct: c.rede_movel_pct,
              rede_fixa_previsao: c.rede_fixa_previsao ?? "",
              rede_movel_previsao: c.rede_movel_previsao ?? "",
            };
          }
        }

        // Merge into municipality list
        const allNames = new Set([
          ...Object.keys(MUNICIPALITY_COORDS),
          ...Object.keys(outageMap),
          ...Object.keys(meoMap),
        ]);

        const result: MunicipalityData[] = [];
        for (const name of allNames) {
          const coords = MUNICIPALITY_COORDS[name];
          if (!coords) continue; // skip if we don't have coordinates

          result.push({
            name,
            lat: coords.lat,
            lng: coords.lng,
            outages: outageMap[name] ?? 0,
            meo: meoMap[name] ?? null,
          });
        }

        setMunicipalities(result);

        // Load community reports
        if (reportsRes.status === "fulfilled" && reportsRes.value.ok) {
          const reportsData = await reportsRes.value.json();
          setReports(reportsData.reports ?? []);
        }

        // Load substation markers
        if (subRes.status === "fulfilled" && subRes.value.ok) {
          const subData = await subRes.value.json();
          const subs: SubstationMarker[] = [];
          for (const s of subData.substations ?? []) {
            const coords = SUBSTATION_COORDS[s.name];
            if (coords) {
              subs.push({
                name: s.name,
                lat: coords.lat,
                lng: coords.lng,
                latestLoad: s.latestLoad,
              });
            }
          }
          setSubstations(subs);
        }

        // Load transformer stations (PTD)
        if (ptdRes.status === "fulfilled" && ptdRes.value.ok) {
          const ptdData = await ptdRes.value.json();
          setTransformers(ptdData.transformers ?? []);
        }
      } catch {
        // silent fail
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // Summary stats
  const totalOutages = municipalities.reduce((s, m) => s + m.outages, 0);
  const affectedElec = municipalities.filter((m) => m.outages > 0).length;
  const withMeo = municipalities.filter((m) => m.meo != null);
  const avgMovel =
    withMeo.length > 0
      ? Math.round(
          withMeo.reduce((s, m) => s + (m.meo?.rede_movel_pct ?? 0), 0) /
            withMeo.length
        )
      : null;
  const avgFixa =
    withMeo.length > 0
      ? Math.round(
          withMeo.reduce((s, m) => s + (m.meo?.rede_fixa_pct ?? 0), 0) /
            withMeo.length
        )
      : null;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[500px] rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <MapPin className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Mapa de Infraestruturas
          </h1>
          <p className="text-sm text-muted-foreground">
            Eletricidade e telecomunicações por concelho
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <span className="text-xs text-muted-foreground">Avarias</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{totalOutages}</p>
            <p className="text-xs text-muted-foreground">
              {affectedElec} concelhos
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-blue-400" />
              <span className="text-xs text-muted-foreground">Rede Móvel</span>
            </div>
            <p className="mt-1 text-2xl font-bold">
              {avgMovel != null ? `${avgMovel}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">média distrito</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-cyan-400" />
              <span className="text-xs text-muted-foreground">Rede Fixa</span>
            </div>
            <p className="mt-1 text-2xl font-bold">
              {avgFixa != null ? `${avgFixa}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">média distrito</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4 text-purple-400" />
              <span className="text-xs text-muted-foreground">Reportes</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{reports.length}</p>
            <p className="text-xs text-muted-foreground">da comunidade</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-cyan-400" />
              <span className="text-xs text-muted-foreground">Transf. (PTD)</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{transformers.length > 0 ? transformers.length.toLocaleString() : "—"}</p>
            <p className="text-xs text-muted-foreground">{substations.length} subestações</p>
          </CardContent>
        </Card>
      </div>

      {/* Layer toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Camada:</span>
        {(
          [
            { key: "both", label: "Tudo", icon: MapPin },
            { key: "electricity", label: "Eletricidade", icon: Zap },
            { key: "telecom", label: "Telecomunicações", icon: Wifi },
          ] as const
        ).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setLayer(opt.key)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              layer === opt.key
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <opt.icon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        ))}
      </div>

      {/* Map */}
      <Card>
        <CardContent className="p-0 overflow-hidden rounded-lg">
          <InfrastructureMap municipalities={municipalities} layer={layer} reports={reports} substations={substations} transformers={transformers} />
        </CardContent>
      </Card>

      {/* Details table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Detalhe por Concelho</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Concelho</th>
                  <th className="pb-2 pr-4 font-medium text-center">Avarias</th>
                  <th className="pb-2 pr-4 font-medium text-center">Móvel MEO</th>
                  <th className="pb-2 pr-4 font-medium text-center">Fixa MEO</th>
                  <th className="pb-2 font-medium">Prev. Móvel</th>
                </tr>
              </thead>
              <tbody>
                {[...municipalities]
                  .sort((a, b) => b.outages - a.outages)
                  .map((m) => (
                    <tr key={m.name} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-medium">{m.name}</td>
                      <td className="py-2 pr-4 text-center">
                        {m.outages > 0 ? (
                          <Badge
                            variant="outline"
                            className={
                              m.outages > 20
                                ? "bg-red-500/20 text-red-400 border-red-500/30"
                                : m.outages > 5
                                  ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
                                  : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                            }
                          >
                            {m.outages}
                          </Badge>
                        ) : (
                          <span className="text-emerald-400">0</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-center">
                        {m.meo?.rede_movel_pct != null ? (
                          <span
                            className={
                              m.meo.rede_movel_pct >= 95
                                ? "text-emerald-400"
                                : m.meo.rede_movel_pct >= 80
                                  ? "text-yellow-400"
                                  : "text-red-400"
                            }
                          >
                            {m.meo.rede_movel_pct}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-center">
                        {m.meo?.rede_fixa_pct != null ? (
                          <span
                            className={
                              m.meo.rede_fixa_pct >= 95
                                ? "text-emerald-400"
                                : m.meo.rede_fixa_pct >= 80
                                  ? "text-yellow-400"
                                  : "text-red-400"
                            }
                          >
                            {m.meo.rede_fixa_pct}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {m.meo?.rede_movel_previsao || "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Fontes: E-REDES (avarias) · MEO Disponibilidade (telecomunicações)
        {meoUpdated && <> · MEO atualizado: {meoUpdated}</>}
      </p>
    </div>
  );
}
