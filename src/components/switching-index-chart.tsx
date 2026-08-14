"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IndexPoint } from "@/lib/switching-index";
import { formatYearMonth } from "@/lib/format";

export function SwitchingIndexChart({ series }: { series: IndexPoint[] }) {
  if (series.length === 0) return null;

  const data = series.map((p) => ({
    month: formatYearMonth(p.month),
    index: p.index,
    orders: p.orders,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
        <defs>
          <linearGradient id="switchingGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v: number) => `${v}%`}
        />
        <ReferenceLine
          y={100}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          label={{
            value: "normal",
            position: "insideTopRight",
            fontSize: 10,
            fill: "var(--muted-foreground)",
          }}
        />
        <Tooltip
          contentStyle={{
            background: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value: number, _name, item) => [
            `${value}% (${item.payload.orders.toLocaleString("pt-PT")} ordens)`,
            "Índice",
          ]}
        />
        <Area
          type="monotone"
          dataKey="index"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#switchingGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
