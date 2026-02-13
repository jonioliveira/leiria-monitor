"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
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
import { AlertTriangle } from "lucide-react";

const OccurrenceMap = dynamic(
  () =>
    import("@/components/occurrence-map").then((mod) => mod.OccurrenceMap),
  { ssr: false, loading: () => <Skeleton className="h-[400px] w-full rounded-lg" /> }
);

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

export default function OcorrenciasPage() {
  const [data, setData] = useState<OccurrencesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/occurrences")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px] rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  const occurrences = data?.occurrences ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-orange-400" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Ocorrências</h1>
            <p className="text-sm text-muted-foreground">
              Proteção Civil — ANEPC
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={
            total === 0
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              : total <= 3
                ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                : "bg-red-500/20 text-red-400 border-red-500/30"
          }
        >
          {total === 0 ? "Sem ocorrências" : `${total} ativa${total > 1 ? "s" : ""}`}
        </Badge>
      </div>

      {/* Map */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Mapa de Ocorrências</CardTitle>
        </CardHeader>
        <CardContent>
          {occurrences.length > 0 ? (
            <OccurrenceMap occurrences={occurrences} />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
              Sem ocorrências ativas no distrito de Leiria
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      {occurrences.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Detalhes das Ocorrências</CardTitle>
          </CardHeader>
          <CardContent>
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
                    <TableCell className="font-medium">
                      {o.nature ?? "—"}
                    </TableCell>
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
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Fonte: ANEPC — Autoridade Nacional de Emergência e Proteção Civil
        {data?.timestamp && (
          <> · Atualizado: {new Date(data.timestamp).toLocaleString("pt-PT")}</>
        )}
      </p>
    </div>
  );
}
