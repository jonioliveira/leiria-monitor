"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface OutageRecord {
  municipality: string;
  count: number;
}

interface OutageChartProps {
  data: OutageRecord[];
}

export function OutageChart({ data }: OutageChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Sem reportes registados
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.count - a.count);

  return (
    <ResponsiveContainer width="100%" height={Math.max(300, sorted.length * 40)}>
      <BarChart data={sorted} layout="vertical" margin={{ left: 20, right: 20 }}>
        <XAxis type="number" tick={{ fill: "#829ab1", fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="municipality"
          width={140}
          tick={{ fill: "#9fb3c8", fontSize: 12 }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#102a43",
            border: "1px solid #334e68",
            borderRadius: "8px",
            color: "#d9e2ec",
            fontSize: "13px",
          }}
          formatter={(value: number) => [`${value} reportes`, "Total"]}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {sorted.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={
                entry.count > 5
                  ? "#ef4444"
                  : entry.count > 0
                    ? "#f59e0b"
                    : "#10b981"
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
