"use client";

import { cn } from "@/lib/utils";

interface RecoveryScoreProps {
  score: number | null;
  className?: string;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

function getScoreRing(score: number): string {
  if (score >= 80) return "stroke-emerald-400";
  if (score >= 60) return "stroke-yellow-400";
  if (score >= 40) return "stroke-orange-400";
  return "stroke-red-400";
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Bom";
  if (score >= 60) return "Moderado";
  if (score >= 40) return "Degradado";
  return "Crítico";
}

export function RecoveryScore({ score, className }: RecoveryScoreProps) {
  if (score == null) {
    return (
      <div className={cn("flex flex-col items-center gap-2", className)}>
        <div className="relative h-36 w-36">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              strokeWidth="8"
              className="stroke-muted"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold text-muted-foreground">
              —
            </span>
            <span className="text-xs text-muted-foreground">Sem dados</span>
          </div>
        </div>
      </div>
    );
  }

  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative h-36 w-36">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            strokeWidth="8"
            className="stroke-muted"
          />
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn("transition-all duration-1000", getScoreRing(score))}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn("text-3xl font-bold", getScoreColor(score))}>
            {score}
          </span>
          <span className="text-xs text-muted-foreground">
            {getScoreLabel(score)}
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Índice de Recuperação</p>
    </div>
  );
}
