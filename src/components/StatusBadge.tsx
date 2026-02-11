"use client";

type StatusLevel = "critical" | "warning" | "ok" | "unknown";

interface StatusBadgeProps {
  status: StatusLevel;
  label?: string;
  pulse?: boolean;
}

const STATUS_CONFIG: Record<
  StatusLevel,
  { bg: string; text: string; border: string; dot: string }
> = {
  critical: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    dot: "bg-red-500",
  },
  warning: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  ok: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
  },
  unknown: {
    bg: "bg-slate-50",
    text: "text-slate-500",
    border: "border-slate-200",
    dot: "bg-slate-400",
  },
};

const LABELS: Record<StatusLevel, string> = {
  critical: "Critico",
  warning: "Degradado",
  ok: "Operacional",
  unknown: "Sem Dados",
};

export default function StatusBadge({
  status,
  label,
  pulse = true,
}: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${config.border}`}
    >
      <span
        className={`w-2 h-2 rounded-full ${config.dot} ${pulse && status === "critical" ? "status-pulse" : ""}`}
      />
      {label || LABELS[status]}
    </span>
  );
}
