"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Satellite, ExternalLink } from "lucide-react";

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

const STATUS_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  ok: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  unknown: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  critical: "Crítico",
  warning: "Ativa",
  ok: "Encerrada",
  unknown: "Sem Dados",
};

const DRM_PHASES: Record<string, string> = {
  response: "Resposta",
  recovery: "Recuperação",
  preparedness: "Preparação",
  prevention: "Prevenção",
};

export default function CopernicusPage() {
  const [data, setData] = useState<CopernicusData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/copernicus")
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
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  const activation = data?.activation;
  const isActive = !activation?.closed;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Satellite className="h-6 w-6 text-purple-400" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Copernicus EMS</h1>
            <p className="text-sm text-muted-foreground">
              Serviço Europeu de Gestão de Emergências — {activation?.code ?? "EMSR861"}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={STATUS_COLORS[data?.status ?? "unknown"]}>
          {STATUS_LABELS[data?.status ?? "unknown"]}
        </Badge>
      </div>

      {/* Activation Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Ativação {activation?.code ?? "EMSR861"}
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
              <p className="text-xs text-muted-foreground">Data de Ativação</p>
              <p className="font-medium">
                {activation?.activationTime
                  ? new Date(activation.activationTime).toLocaleDateString("pt-PT")
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Países</p>
              <p className="font-medium">
                {activation?.countries?.join(", ") || "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="flex flex-col items-center py-6">
            <p className="text-3xl font-bold">{activation?.n_aois ?? 0}</p>
            <p className="text-sm text-muted-foreground">Áreas de Interesse (AOIs)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center py-6">
            <p className="text-3xl font-bold">{activation?.n_products ?? 0}</p>
            <p className="text-sm text-muted-foreground">Produtos Gerados</p>
          </CardContent>
        </Card>
      </div>

      {/* Context */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Sobre esta Ativação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            A ativação EMSR861 do Copernicus EMS foi solicitada na sequência da
            tempestade Kristin, que afetou severamente o distrito de Leiria a 28 de
            janeiro de 2026. O serviço fornece mapeamento de emergência baseado em
            satélite, incluindo cartografia de áreas inundadas, danos em
            infraestruturas e avaliação de impacto.
          </p>
          <p>
            Os produtos incluem mapas de delimitação (delineation), de classificação
            (grading) e de referência pré-evento, cobrindo as áreas de interesse
            identificadas no distrito.
          </p>
        </CardContent>
      </Card>

      {/* Link to portal */}
      <a
        href="https://mapping.emergency.copernicus.eu/activations/EMSR861"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-md bg-purple-500/10 px-4 py-2 text-sm font-medium text-purple-400 transition-colors hover:bg-purple-500/20"
      >
        Ver no portal Copernicus EMS
        <ExternalLink className="h-4 w-4" />
      </a>

      {/* Source */}
      <p className="text-xs text-muted-foreground">
        Fonte: {data?.source ?? "Copernicus EMS"} —{" "}
        {data?.timestamp
          ? `Última atualização: ${new Date(data.timestamp).toLocaleString("pt-PT")}`
          : ""}
      </p>
    </div>
  );
}
