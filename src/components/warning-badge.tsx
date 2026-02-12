"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface WarningBadgeProps {
  level: string;
  type: string;
  text?: string | null;
  className?: string;
}

const LEVEL_STYLES: Record<string, string> = {
  red: "bg-red-500/20 text-red-400 border-red-500/30",
  orange: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  green: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const LEVEL_LABELS: Record<string, string> = {
  red: "Vermelho",
  orange: "Laranja",
  yellow: "Amarelo",
  green: "Verde",
};

export function WarningBadge({ level, type, text, className }: WarningBadgeProps) {
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border border-border bg-card p-3", className)}>
      <Badge
        variant="outline"
        className={cn("shrink-0", LEVEL_STYLES[level] ?? LEVEL_STYLES.green)}
      >
        {LEVEL_LABELS[level] ?? level}
      </Badge>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{type}</p>
        {text && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {text}
          </p>
        )}
      </div>
    </div>
  );
}
