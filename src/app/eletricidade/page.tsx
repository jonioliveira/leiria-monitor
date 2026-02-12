"use client";

import { useState, useEffect } from "react";
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
import { Zap } from "lucide-react";

interface ElectricityData {
  success: boolean;
  timestamp: string;
  leiria: {
    active_outages: {
      total_outage_count: number;
      municipalities_affected: number;
      records: { municipality: string; count: number; extraction_datetime: string | null }[];
      extraction_datetime: string | null;
    };
    scheduled_interruptions: {
      total_records: number;
      records: {
        postal_code: string | null;
        locality: string | null;
        district: string | null;
        municipality: string | null;
        start_time: string | null;
        end_time: string | null;
        reason: string | null;
      }[];
    };
  };
}

export default function EletricidadePage() {
  const [data, setData] = useState<ElectricityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/electricity")
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

  const outages = data?.leiria?.active_outages;
  const scheduled = data?.leiria?.scheduled_interruptions;
  const totalOutages = outages?.total_outage_count ?? 0;

  const statusColor =
    totalOutages > 5
      ? "bg-red-500/20 text-red-400 border-red-500/30"
      : totalOutages > 0
        ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
        : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  const statusLabel =
    totalOutages > 5 ? "Crítico" : totalOutages > 0 ? "Degradado" : "Operacional";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="h-6 w-6 text-amber-400" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Eletricidade</h1>
            <p className="text-sm text-muted-foreground">
              Avarias e interrupções — E-REDES
            </p>
          </div>
        </div>
        <Badge variant="outline" className={statusColor}>
          {statusLabel}
        </Badge>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-bold">{totalOutages}</p>
            <p className="text-xs text-muted-foreground">Avarias ativas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-bold">
              {outages?.municipalities_affected ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Concelhos afetados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-3xl font-bold">
              {scheduled?.total_records ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Obras agendadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Avarias por Concelho</CardTitle>
        </CardHeader>
        <CardContent>
          <OutageChart
            data={
              outages?.records.map((r) => ({
                municipality: r.municipality,
                count: r.count,
              })) ?? []
            }
          />
        </CardContent>
      </Card>

      {/* Scheduled Work Table */}
      {(scheduled?.records.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Trabalhos Agendados</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Localidade</TableHead>
                  <TableHead>Concelho</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduled!.records.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      {r.locality ?? "—"}
                    </TableCell>
                    <TableCell>{r.municipality ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {r.start_time ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.end_time ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {r.reason ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Source attribution */}
      <p className="text-xs text-muted-foreground">
        Fonte: E-REDES Open Data Portal
        {outages?.extraction_datetime && (
          <> · Extração: {outages.extraction_datetime}</>
        )}
      </p>
    </div>
  );
}
