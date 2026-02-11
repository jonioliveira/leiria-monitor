"use client";

import { ReactNode } from "react";

interface CardProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
  accentColor?: "red" | "amber" | "green" | "blue" | "none";
  headerRight?: ReactNode;
}

const ACCENT_COLORS: Record<string, string> = {
  red: "#e53e3e",
  amber: "#dd6b20",
  green: "#38a169",
  blue: "#3182ce",
  none: "#e2e8f0",
};

export default function Card({
  title,
  icon,
  children,
  className = "",
  accentColor = "none",
  headerRight,
}: CardProps) {
  const color = ACCENT_COLORS[accentColor] ?? ACCENT_COLORS.none;

  return (
    <div
      className={`relative rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden animate-fade-in ${className}`}
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{ background: `linear-gradient(to right, ${color}, transparent)` }}
      />

      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <span className="text-lg">{icon}</span>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              {title}
            </h3>
          </div>
          {headerRight}
        </div>
        {children}
      </div>
    </div>
  );
}
