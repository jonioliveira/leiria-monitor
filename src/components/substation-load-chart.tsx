"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";

interface DataPoint {
  time: string;
  totalLoad?: number;
  projectedLoad?: number;
  baseline?: number;
}

interface SubstationLoadChartProps {
  actual: { time: string; totalLoad: number }[];
  projection: { time: string; projectedLoad: number }[];
  baseline: number;
}

// "2026-01-26 00" -> "26/01 00h"
function formatTime(str: string): string {
  const parts = str.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2})/);
  if (!parts) return str;
  return `${parts[3]}/${parts[2]} ${parts[4]}h`;
}

export function SubstationLoadChart({
  actual,
  projection,
  baseline,
}: SubstationLoadChartProps) {
  if (actual.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Sem dados de carga de subestações
      </div>
    );
  }

  // Merge actual + projection into a single timeline
  const data: DataPoint[] = actual.map((a) => ({
    time: a.time,
    totalLoad: a.totalLoad,
    baseline,
  }));

  // Bridge: last actual point starts the projection
  if (projection.length > 0 && actual.length > 0) {
    const last = actual[actual.length - 1];
    data.push({
      time: last.time,
      totalLoad: last.totalLoad,
      projectedLoad: last.totalLoad,
      baseline,
    });
  }

  for (const p of projection) {
    data.push({
      time: p.time,
      projectedLoad: p.projectedLoad,
      baseline,
    });
  }

  const allLoads = data.map(
    (d) => d.totalLoad ?? d.projectedLoad ?? d.baseline ?? 0
  );
  const maxLoad = Math.max(...allLoads, baseline);

  const stormHour = "2026-01-28 12";
  const hasStormDate = actual.some((d) => d.time === stormHour);

  return (
    <ResponsiveContainer width="100%" height={360}>
      <ComposedChart
        data={data}
        margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
      >
        <defs>
          <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="time"
          tickFormatter={formatTime}
          tick={{ fill: "#829ab1", fontSize: 10 }}
          interval="preserveStartEnd"
          minTickGap={80}
        />
        <YAxis
          tick={{ fill: "#9fb3c8", fontSize: 12 }}
          label={{
            value: "MW",
            angle: -90,
            position: "insideLeft",
            fill: "#9fb3c8",
            fontSize: 12,
          }}
          domain={[0, Math.ceil(maxLoad * 1.1)]}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#102a43",
            border: "1px solid #334e68",
            borderRadius: "8px",
            color: "#d9e2ec",
            fontSize: "13px",
          }}
          labelFormatter={formatTime}
          formatter={(value: number, name: string) => {
            const labels: Record<string, string> = {
              totalLoad: "Carga real",
              projectedLoad: "Projeção",
              baseline: "Baseline normal",
            };
            return [`${value.toFixed(1)} MW`, labels[name] ?? name];
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: "12px", color: "#9fb3c8" }}
          formatter={(value: string) => {
            const labels: Record<string, string> = {
              totalLoad: "Carga real",
              projectedLoad: "Projeção recuperação",
              baseline: "Baseline pré-tempestade",
            };
            return labels[value] ?? value;
          }}
        />

        {/* Baseline reference line */}
        <ReferenceLine
          y={baseline}
          stroke="#64748b"
          strokeDasharray="6 4"
          strokeWidth={1.5}
        />

        {/* Storm date marker */}
        {hasStormDate && (
          <ReferenceLine
            x={stormHour}
            stroke="#ef4444"
            strokeDasharray="4 4"
            label={{
              value: "Kristin",
              fill: "#ef4444",
              fontSize: 11,
              position: "top",
            }}
          />
        )}

        {/* Actual load area */}
        <Area
          type="monotone"
          dataKey="totalLoad"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#actualGradient)"
          dot={false}
          activeDot={{ r: 4, fill: "#10b981" }}
          connectNulls={false}
        />

        {/* Projection dashed line */}
        <Line
          type="monotone"
          dataKey="projectedLoad"
          stroke="#f59e0b"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
          activeDot={{ r: 4, fill: "#f59e0b" }}
          connectNulls={false}
        />

        {/* Baseline line (hidden via legend, shown as ReferenceLine) */}
        <Line
          type="monotone"
          dataKey="baseline"
          stroke="transparent"
          dot={false}
          activeDot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
