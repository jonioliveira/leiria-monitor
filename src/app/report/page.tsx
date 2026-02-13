"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { MessageSquarePlus, Zap, Wifi, ThumbsUp, MapPin, X } from "lucide-react";
import type { Report } from "@/components/report-map";

const ReportMap = dynamic(
  () => import("@/components/report-map").then((mod) => mod.ReportMap),
  { ssr: false, loading: () => <Skeleton className="h-[500px] w-full rounded-lg" /> }
);

type ReportType = "electricity" | "telecom";
const OPERATORS = ["MEO", "NOS", "Vodafone", "DIGI"] as const;

export default function ReportarPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formLat, setFormLat] = useState<number | null>(null);
  const [formLng, setFormLng] = useState<number | null>(null);
  const [formType, setFormType] = useState<ReportType>("electricity");
  const [formOperator, setFormOperator] = useState<string>("MEO");
  const [formStreet, setFormStreet] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch("/api/reports");
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports ?? []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  function handleMapClick(lat: number, lng: number) {
    setFormLat(lat);
    setFormLng(lng);
    setShowForm(true);
    setSubmitted(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formLat || !formLng) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: formType,
          operator: formType === "telecom" ? formOperator : null,
          description: formDescription || null,
          street: formStreet || null,
          lat: formLat,
          lng: formLng,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
        setFormStreet("");
        setFormDescription("");
        await fetchReports();
        setTimeout(() => { setShowForm(false); setSubmitted(false); }, 2000);
      }
    } catch { /* silent */ }
    finally { setSubmitting(false); }
  }

  async function handleUpvote(id: number) {
    try {
      await fetch("/api/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "upvote" }),
      });
      setReports((prev) =>
        prev.map((r) => (r.id === id ? { ...r, upvotes: r.upvotes + 1 } : r))
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

  const electricityReports = reports.filter((r) => r.type === "electricity");
  const telecomReports = reports.filter((r) => r.type === "telecom");

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <MessageSquarePlus className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Reportar Problema</h1>
          <p className="text-sm text-muted-foreground">
            Clique no mapa para indicar onde não tem luz ou rede
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Reportes</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{reports.length}</p>
            <p className="text-xs text-muted-foreground">últimos 7 dias</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <span className="text-xs text-muted-foreground">Sem Luz</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{electricityReports.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-blue-400" />
              <span className="text-xs text-muted-foreground">Sem Rede</span>
            </div>
            <p className="mt-1 text-2xl font-bold">{telecomReports.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground">Confirmações</span>
            </div>
            <p className="mt-1 text-2xl font-bold">
              {reports.reduce((s, r) => s + r.upvotes, 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm text-foreground">
          <strong>Como funciona:</strong> Clique no mapa no local exato do problema.
          Escolha se é falta de luz ou falta de rede, indique a rua e envie.
          Outros vizinhos podem confirmar o seu reporte com o botão <em>"+1 Confirmo"</em>.
        </p>
      </div>

      {/* Map + Form side by side on desktop */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Map */}
        <Card>
          <CardContent className="p-0 overflow-hidden rounded-lg">
            {loading ? (
              <Skeleton className="h-[500px] w-full" />
            ) : (
              <ReportMap
                reports={reports}
                onMapClick={handleMapClick}
                onUpvote={handleUpvote}
                onResolve={handleResolve}
              />
            )}
          </CardContent>
        </Card>

        {/* Report form */}
        <Card className="self-start">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-sm">
              <span>Novo Reporte</span>
              {showForm && (
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!showForm ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <MapPin className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Clique no mapa para marcar a localização do problema
                </p>
              </div>
            ) : submitted ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="rounded-full bg-emerald-500/20 p-3">
                  <ThumbsUp className="h-6 w-6 text-emerald-400" />
                </div>
                <p className="text-sm font-medium text-emerald-400">Reporte enviado!</p>
                <p className="text-xs text-muted-foreground">Obrigado pela contribuição.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Location */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Localização</label>
                  <p className="mt-0.5 text-sm font-mono text-foreground">
                    {formLat?.toFixed(5)}, {formLng?.toFixed(5)}
                  </p>
                </div>

                {/* Type */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Tipo de problema</label>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormType("electricity")}
                      className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
                        formType === "electricity"
                          ? "border-amber-400/50 bg-amber-400/10 text-amber-400"
                          : "border-border text-muted-foreground hover:border-foreground/20"
                      }`}
                    >
                      <Zap className="h-4 w-4" />
                      Sem Luz
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormType("telecom")}
                      className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
                        formType === "telecom"
                          ? "border-blue-400/50 bg-blue-400/10 text-blue-400"
                          : "border-border text-muted-foreground hover:border-foreground/20"
                      }`}
                    >
                      <Wifi className="h-4 w-4" />
                      Sem Rede
                    </button>
                  </div>
                </div>

                {/* Operator (telecom only) */}
                {formType === "telecom" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Operadora</label>
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                      {OPERATORS.map((op) => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => setFormOperator(op)}
                          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                            formOperator === op
                              ? "border-primary/50 bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-foreground/20"
                          }`}
                        >
                          {op}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Street */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Rua / Local <span className="text-muted-foreground/60">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={formStreet}
                    onChange={(e) => setFormStreet(e.target.value)}
                    placeholder="Ex: Rua de São Domingos"
                    className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Descrição <span className="text-muted-foreground/60">(opcional)</span>
                  </label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Ex: Sem luz desde as 14h, todo o prédio afetado"
                    rows={2}
                    className="mt-1 w-full resize-none rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? "A enviar..." : "Enviar Reporte"}
                </button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Recent reports list */}
      {reports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Reportes Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {reports.slice(0, 20).map((r) => {
                const isElec = r.type === "electricity";
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center gap-3">
                      {isElec ? (
                        <Zap className="h-4 w-4 shrink-0 text-amber-400" />
                      ) : (
                        <Wifi className="h-4 w-4 shrink-0 text-blue-400" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {isElec ? "Sem luz" : `Sem rede ${r.operator ?? ""}`}
                          {r.street && (
                            <span className="ml-1 text-muted-foreground"> — {r.street}</span>
                          )}
                        </p>
                        {r.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                            {r.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {r.upvotes} {r.upvotes === 1 ? "confirmação" : "confirmações"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleString("pt-PT", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Os reportes são da comunidade e expiram após 7 dias. Confirme reportes existentes
        para dar mais visibilidade. Marque como resolvido quando o problema estiver corrigido.
      </p>
    </div>
  );
}
