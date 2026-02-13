"use client";

import { useState } from "react";
import { Zap, Wifi, Globe, Droplets, X, ThumbsUp, MapPin } from "lucide-react";

type ReportType = "electricity" | "telecom_mobile" | "telecom_fixed" | "water";
const OPERATORS = ["MEO", "NOS", "Vodafone", "DIGI"] as const;

export interface InfraContext {
  label: string;
  type: ReportType;
  operator: string | null;
  details: string[];
}

interface ReportPanelProps {
  lat: number | null;
  lng: number | null;
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
  infraContext?: InfraContext | null;
}

export function ReportPanel({ lat, lng, open, onClose, onSubmitted, infraContext }: ReportPanelProps) {
  const [formType, setFormType] = useState<ReportType>("electricity");
  const [formOperator, setFormOperator] = useState<string>("MEO");
  const [formStreet, setFormStreet] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const effectiveType = infraContext?.type ?? formType;
  const effectiveOperator = infraContext?.operator ?? (effectiveType.startsWith("telecom") ? formOperator : null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lat || !lng) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: effectiveType,
          operator: effectiveType.startsWith("telecom") ? effectiveOperator : null,
          description: formDescription || null,
          street: infraContext ? infraContext.label : (formStreet || null),
          lat,
          lng,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
        setFormStreet("");
        setFormDescription("");
        onSubmitted();
        setTimeout(() => {
          setSubmitted(false);
          onClose();
        }, 2000);
      }
    } catch {
      /* silent */
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Mobile: bottom sheet */}
      <div className="fixed inset-x-0 bottom-0 z-[1000] rounded-t-2xl border-t border-border bg-background p-4 shadow-2xl sm:hidden animate-slide-up">
        {/* Drag handle */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />

        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">
            {infraContext ? "Reportar Problema" : "Novo Reporte"}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="rounded-full bg-emerald-500/20 p-3">
              <ThumbsUp className="h-6 w-6 text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-emerald-400">Reporte enviado!</p>
          </div>
        ) : infraContext ? (
          <InfraReportForm
            infraContext={infraContext}
            formDescription={formDescription}
            setFormDescription={setFormDescription}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        ) : (
          <ReportForm
            lat={lat}
            lng={lng}
            formType={formType}
            setFormType={setFormType}
            formOperator={formOperator}
            setFormOperator={setFormOperator}
            formStreet={formStreet}
            setFormStreet={setFormStreet}
            formDescription={formDescription}
            setFormDescription={setFormDescription}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        )}
      </div>

      {/* Desktop: sidebar */}
      <div className="absolute right-0 top-0 z-[1000] hidden h-full w-96 border-l border-border bg-background p-5 shadow-2xl sm:block overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">
            {infraContext ? "Reportar Problema" : "Novo Reporte"}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!lat && !infraContext ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <MapPin className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Clique no mapa para marcar a localização
            </p>
          </div>
        ) : submitted ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="rounded-full bg-emerald-500/20 p-3">
              <ThumbsUp className="h-6 w-6 text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-emerald-400">Reporte enviado!</p>
            <p className="text-xs text-muted-foreground">Obrigado pela contribuição.</p>
          </div>
        ) : infraContext ? (
          <InfraReportForm
            infraContext={infraContext}
            formDescription={formDescription}
            setFormDescription={setFormDescription}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        ) : (
          <ReportForm
            lat={lat}
            lng={lng}
            formType={formType}
            setFormType={setFormType}
            formOperator={formOperator}
            setFormOperator={setFormOperator}
            formStreet={formStreet}
            setFormStreet={setFormStreet}
            formDescription={formDescription}
            setFormDescription={setFormDescription}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </>
  );
}

/* ── Shared form ───────────────────────────────────────────── */

function ReportForm({
  lat,
  lng,
  formType,
  setFormType,
  formOperator,
  setFormOperator,
  formStreet,
  setFormStreet,
  formDescription,
  setFormDescription,
  submitting,
  onSubmit,
}: {
  lat: number | null;
  lng: number | null;
  formType: ReportType;
  setFormType: (t: ReportType) => void;
  formOperator: string;
  setFormOperator: (o: string) => void;
  formStreet: string;
  setFormStreet: (s: string) => void;
  formDescription: string;
  setFormDescription: (d: string) => void;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Location */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Localização</label>
        <p className="mt-0.5 text-sm font-mono text-foreground">
          {lat?.toFixed(5)}, {lng?.toFixed(5)}
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
            onClick={() => setFormType("telecom_mobile")}
            className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
              formType === "telecom_mobile"
                ? "border-blue-400/50 bg-blue-400/10 text-blue-400"
                : "border-border text-muted-foreground hover:border-foreground/20"
            }`}
          >
            <Wifi className="h-4 w-4" />
            Sem Rede Móvel
          </button>
          <button
            type="button"
            onClick={() => setFormType("telecom_fixed")}
            className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
              formType === "telecom_fixed"
                ? "border-indigo-400/50 bg-indigo-400/10 text-indigo-400"
                : "border-border text-muted-foreground hover:border-foreground/20"
            }`}
          >
            <Globe className="h-4 w-4" />
            Sem Rede Fixa
          </button>
          <button
            type="button"
            onClick={() => setFormType("water")}
            className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
              formType === "water"
                ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-400"
                : "border-border text-muted-foreground hover:border-foreground/20"
            }`}
          >
            <Droplets className="h-4 w-4" />
            Sem Água
          </button>
        </div>
      </div>

      {/* Operator (telecom only) */}
      {formType.startsWith("telecom") && (
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
  );
}

/* ── Simplified form for infrastructure reports ───────────── */

function InfraReportForm({
  infraContext,
  formDescription,
  setFormDescription,
  submitting,
  onSubmit,
}: {
  infraContext: InfraContext;
  formDescription: string;
  setFormDescription: (d: string) => void;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Infrastructure info */}
      <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
        <p className="text-sm font-semibold text-foreground">{infraContext.label}</p>
        {infraContext.details.map((d, i) => (
          <p key={i} className="text-xs text-muted-foreground">{d}</p>
        ))}
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">
          Descreva o problema
        </label>
        <textarea
          value={formDescription}
          onChange={(e) => setFormDescription(e.target.value)}
          placeholder="Ex: Poste caído, sem eletricidade desde ontem..."
          rows={3}
          autoFocus
          className="mt-1 w-full resize-none rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
      >
        {submitting ? "A enviar..." : "Reportar Problema"}
      </button>
    </form>
  );
}
