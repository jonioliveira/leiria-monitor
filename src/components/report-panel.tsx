"use client";

import { useState, useRef } from "react";
import {
  Zap, Wifi, Globe, Droplets, Construction, X, ThumbsUp, MapPin, Camera, Loader2,
  Smartphone, HelpCircle, TreePine, AlertTriangle, Waves, Trash2, WifiOff,
} from "lucide-react";
import { queueReport } from "@/lib/report-queue";

type ReportCategory = "electricity" | "telecom" | "roads" | "water" | "other";
export type ReportType =
  | "electricity"
  | "telecom_mobile"
  | "telecom_fixed"
  | "water"
  | "water_leak"
  | "roads"
  | "roads_tree"
  | "roads_damage"
  | "other_garbage"
  | "other";

const OPERATORS = ["MEO", "NOS", "Vodafone", "DIGI"] as const;

type CatConfig = { id: ReportCategory; label: string; icon: typeof Zap; activeClass: string };
const CATEGORY_CONFIG: CatConfig[] = [
  { id: "electricity", label: "Luz", icon: Zap, activeClass: "border-amber-400/50 bg-amber-400/10 text-amber-400" },
  { id: "telecom", label: "Telecom", icon: Wifi, activeClass: "border-blue-400/50 bg-blue-400/10 text-blue-400" },
  { id: "roads", label: "Estrada", icon: Construction, activeClass: "border-orange-400/50 bg-orange-400/10 text-orange-400" },
  { id: "water", label: "Água", icon: Droplets, activeClass: "border-cyan-400/50 bg-cyan-400/10 text-cyan-400" },
  { id: "other", label: "Outro", icon: HelpCircle, activeClass: "border-purple-400/50 bg-purple-400/10 text-purple-400" },
];

const SUBCATEGORY_CONFIG: Record<ReportCategory, { type: ReportType; label: string; icon: typeof Zap }[]> = {
  electricity: [],
  telecom: [
    { type: "telecom_mobile", label: "Rede Móvel", icon: Smartphone },
    { type: "telecom_fixed", label: "Rede Fixa", icon: Globe },
  ],
  roads: [
    { type: "roads", label: "Cortada", icon: Construction },
    { type: "roads_tree", label: "Árvore", icon: TreePine },
    { type: "roads_damage", label: "Dano", icon: AlertTriangle },
  ],
  water: [
    { type: "water", label: "Sem água", icon: Droplets },
    { type: "water_leak", label: "Rotura", icon: Waves },
  ],
  other: [
    { type: "other_garbage", label: "Lixo", icon: Trash2 },
    { type: "other", label: "Outro", icon: HelpCircle },
  ],
};

const CATEGORY_DEFAULT_TYPE: Record<ReportCategory, ReportType> = {
  electricity: "electricity",
  telecom: "telecom_mobile",
  roads: "roads",
  water: "water",
  other: "other_garbage",
};

export interface InfraContext {
  label: string;
  type: "electricity" | "telecom_mobile" | "telecom_fixed" | "water" | "roads";
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
  const [formCategory, setFormCategory] = useState<ReportCategory | null>(null);
  const [formType, setFormType] = useState<ReportType>("electricity");
  const [formOperator, setFormOperator] = useState<string>("MEO");
  const [formStreet, setFormStreet] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedPriority, setSubmittedPriority] = useState<string | null>(null);
  const [queuedOffline, setQueuedOffline] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fallenPole, setFallenPole] = useState(false);
  const [poleHasPower, setPoleHasPower] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const effectiveType = infraContext?.type ?? formType;
  const effectiveOperator = infraContext?.operator ?? (effectiveType.startsWith("telecom") ? formOperator : null);

  async function handleImageUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/reports/upload", { method: "POST", body: form });
      if (res.ok) {
        const data = await res.json();
        setImageUrl(data.imageUrl);
      }
    } catch {
      /* silent */
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lat || !lng) return;

    const reportData = {
      type: effectiveType,
      operator: effectiveType.startsWith("telecom") ? effectiveOperator : null,
      description: (() => {
        const tag = fallenPole
          ? (poleHasPower ? "[POSTE CAÍDO COM CORRENTE]" : "[POSTE CAÍDO]")
          : null;
        const desc = formDescription || null;
        if (tag && desc) return `${tag} ${desc}`;
        if (tag) return tag;
        return desc;
      })(),
      street: infraContext ? infraContext.label : (formStreet || null),
      lat,
      lng,
      imageUrl,
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reportData),
      });

      if (res.ok) {
        const data = await res.json();
        setSubmittedPriority(data.priority ?? "normal");
        setQueuedOffline(false);
        setSubmitted(true);
        setFormCategory(null);
        setFormStreet("");
        setFormDescription("");
        setImageUrl(null);
        setFallenPole(false);
        setPoleHasPower(false);
        onSubmitted();
        setTimeout(() => {
          setSubmitted(false);
          setSubmittedPriority(null);
          onClose();
        }, 3000);
      }
    } catch {
      // Network failure — queue locally for replay when connectivity returns
      queueReport(reportData);
      setQueuedOffline(true);
      setSubmitted(true);
      setFormCategory(null);
      setFormStreet("");
      setFormDescription("");
      setImageUrl(null);
      setFallenPole(false);
      setPoleHasPower(false);
      setTimeout(() => {
        setSubmitted(false);
        setQueuedOffline(false);
        onClose();
      }, 4000);
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
            <div className={`rounded-full p-3 ${queuedOffline ? "bg-amber-500/20" : "bg-emerald-500/20"}`}>
              {queuedOffline
                ? <WifiOff className="h-6 w-6 text-amber-400" />
                : <ThumbsUp className="h-6 w-6 text-emerald-400" />
              }
            </div>
            {queuedOffline ? (
              <>
                <p className="text-sm font-medium text-amber-400">Reporte guardado</p>
                <p className="text-xs text-muted-foreground">Será enviado quando tiveres ligação</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-emerald-400">Reporte enviado!</p>
                {submittedPriority && submittedPriority !== "normal" && (
                  <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-bold text-white ${
                    submittedPriority === "urgente" ? "bg-red-500" : "bg-orange-500"
                  }`}>
                    Prioridade: {submittedPriority === "urgente" ? "Urgente" : "Importante"}
                  </span>
                )}
              </>
            )}
          </div>
        ) : infraContext ? (
          <InfraReportForm
            infraContext={infraContext}
            formDescription={formDescription}
            setFormDescription={setFormDescription}
            fallenPole={fallenPole}
            setFallenPole={setFallenPole}
            poleHasPower={poleHasPower}
            setPoleHasPower={setPoleHasPower}
            submitting={submitting}
            onSubmit={handleSubmit}
            imageUrl={imageUrl}
            uploading={uploading}
            fileRef={fileRef}
            onImageUpload={handleImageUpload}
          />
        ) : (
          <ReportForm
            lat={lat}
            lng={lng}
            formCategory={formCategory}
            setFormCategory={setFormCategory}
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
            imageUrl={imageUrl}
            uploading={uploading}
            fileRef={fileRef}
            onImageUpload={handleImageUpload}
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
            {submittedPriority && submittedPriority !== "normal" && (
              <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-bold text-white ${
                submittedPriority === "urgente" ? "bg-red-500" : "bg-orange-500"
              }`}>
                Prioridade: {submittedPriority === "urgente" ? "Urgente" : "Importante"}
              </span>
            )}
            <p className="text-xs text-muted-foreground">Obrigado pela contribuição.</p>
          </div>
        ) : infraContext ? (
          <InfraReportForm
            infraContext={infraContext}
            formDescription={formDescription}
            setFormDescription={setFormDescription}
            fallenPole={fallenPole}
            setFallenPole={setFallenPole}
            poleHasPower={poleHasPower}
            setPoleHasPower={setPoleHasPower}
            submitting={submitting}
            onSubmit={handleSubmit}
            imageUrl={imageUrl}
            uploading={uploading}
            fileRef={fileRef}
            onImageUpload={handleImageUpload}
          />
        ) : (
          <ReportForm
            lat={lat}
            lng={lng}
            formCategory={formCategory}
            setFormCategory={setFormCategory}
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
            imageUrl={imageUrl}
            uploading={uploading}
            fileRef={fileRef}
            onImageUpload={handleImageUpload}
          />
        )}
      </div>
    </>
  );
}

/* ── Photo upload section ─────────────────────────────────── */

function PhotoUpload({
  imageUrl,
  uploading,
  fileRef,
  onImageUpload,
}: {
  imageUrl: string | null;
  uploading: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onImageUpload: (file: File) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">
        Foto <span className="text-muted-foreground/60">(opcional)</span>
      </label>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImageUpload(file);
        }}
      />
      {imageUrl ? (
        <div className="mt-1.5 relative">
          <img src={imageUrl} alt="Preview" className="w-full max-h-32 object-cover rounded-lg border border-border" />
          <button
            type="button"
            onClick={() => {
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="absolute top-1 right-1 rounded-full bg-background/80 p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Camera className="h-4 w-4" />
          )}
          {uploading ? "A carregar..." : "Adicionar foto"}
        </button>
      )}
    </div>
  );
}

/* ── Shared form ───────────────────────────────────────────── */

function ReportForm({
  lat,
  lng,
  formCategory,
  setFormCategory,
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
  imageUrl,
  uploading,
  fileRef,
  onImageUpload,
}: {
  lat: number | null;
  lng: number | null;
  formCategory: ReportCategory | null;
  setFormCategory: (c: ReportCategory | null) => void;
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
  imageUrl: string | null;
  uploading: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onImageUpload: (file: File) => void;
}) {
  const subcats = formCategory ? SUBCATEGORY_CONFIG[formCategory] : [];
  const catCfg = CATEGORY_CONFIG.find((c) => c.id === formCategory);

  function handleCategorySelect(cat: ReportCategory) {
    setFormCategory(cat);
    setFormType(CATEGORY_DEFAULT_TYPE[cat]);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Location */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Localização</label>
        <p className="mt-0.5 text-sm font-mono text-foreground">
          {lat?.toFixed(5)}, {lng?.toFixed(5)}
        </p>
      </div>

      {/* Step 1: Category */}
      <div>
        <label className="text-xs font-medium text-muted-foreground">Tipo de problema</label>
        <div className="mt-1.5 grid grid-cols-5 gap-1.5">
          {CATEGORY_CONFIG.map((cat) => {
            const isActive = formCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategorySelect(cat.id)}
                className={`flex flex-col items-center gap-1 rounded-lg border py-2.5 px-1 text-xs font-medium transition-colors ${
                  isActive ? cat.activeClass : "border-border text-muted-foreground hover:border-foreground/20"
                }`}
              >
                <cat.icon className="h-4 w-4" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Subcategory */}
      {formCategory && subcats.length > 0 && (
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            {formCategory === "telecom" ? "Tipo de ligação" : "Detalhar problema"}
          </label>
          <div className={`mt-1.5 grid gap-2 ${subcats.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
            {subcats.map((sub) => {
              const isActive = formType === sub.type;
              return (
                <button
                  key={sub.type}
                  type="button"
                  onClick={() => setFormType(sub.type)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border p-2.5 text-xs font-medium transition-colors ${
                    isActive
                      ? (catCfg?.activeClass ?? "border-primary/50 bg-primary/10 text-primary")
                      : "border-border text-muted-foreground hover:border-foreground/20"
                  }`}
                >
                  <sub.icon className="h-3.5 w-3.5" />
                  {sub.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Operator (telecom only) */}
      {formCategory && formType.startsWith("telecom") && (
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

      {/* Detail fields — only shown after category is selected */}
      {formCategory && (
        <>
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

          {/* Photo upload */}
          <PhotoUpload
            imageUrl={imageUrl}
            uploading={uploading}
            fileRef={fileRef}
            onImageUpload={onImageUpload}
          />

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? "A enviar..." : "Enviar Reporte"}
          </button>
        </>
      )}
    </form>
  );
}

/* ── Simplified form for infrastructure reports ───────────── */

function InfraReportForm({
  infraContext,
  formDescription,
  setFormDescription,
  fallenPole,
  setFallenPole,
  poleHasPower,
  setPoleHasPower,
  submitting,
  onSubmit,
  imageUrl,
  uploading,
  fileRef,
  onImageUpload,
}: {
  infraContext: InfraContext;
  formDescription: string;
  setFormDescription: (d: string) => void;
  fallenPole: boolean;
  setFallenPole: (v: boolean) => void;
  poleHasPower: boolean;
  setPoleHasPower: (v: boolean) => void;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  imageUrl: string | null;
  uploading: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onImageUpload: (file: File) => void;
}) {
  const label = infraContext.label.toLowerCase();
  const isPoleElectricity = infraContext.type === "electricity" && (label.includes("poste") || label.includes("posto de transformação"));

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Infrastructure info */}
      <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
        <p className="text-sm font-semibold text-foreground">{infraContext.label}</p>
        {infraContext.details.map((d, i) => (
          <p key={i} className="text-xs text-muted-foreground">{d}</p>
        ))}
      </div>

      {/* Fallen pole checkboxes for electricity poles */}
      {isPoleElectricity && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={fallenPole}
              onChange={(e) => {
                setFallenPole(e.target.checked);
                if (!e.target.checked) setPoleHasPower(false);
              }}
              className="h-4 w-4 rounded border-border accent-red-500"
            />
            <span className="text-sm font-medium text-foreground">Poste caído / partido</span>
          </label>

          {fallenPole && (
            <>
              <label className="flex items-center gap-2 cursor-pointer ml-6">
                <input
                  type="checkbox"
                  checked={poleHasPower}
                  onChange={(e) => setPoleHasPower(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-red-500"
                />
                <span className="text-sm font-medium text-red-400">Poste com corrente elétrica</span>
              </label>

              {poleHasPower && (
                <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 ml-6">
                  <p className="text-xs font-bold text-red-400 leading-snug">
                    &#9888;&#65039; PERIGO: Não toque no poste nem nos cabos. Ligue 112.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

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

      {/* Photo upload */}
      <PhotoUpload
        imageUrl={imageUrl}
        uploading={uploading}
        fileRef={fileRef}
        onImageUpload={onImageUpload}
      />

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
