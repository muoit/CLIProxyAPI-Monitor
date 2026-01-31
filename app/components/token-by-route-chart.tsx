"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import type { RouteTokenSeriesPoint } from "@/lib/types";
import { formatCompactNumber, formatNumberWithCommas } from "@/lib/utils";

interface TokenByRouteChartProps {
  data: RouteTokenSeriesPoint[];
  routes: string[]; // top N route names (in order)
  darkMode: boolean;
  isHourly?: boolean;
  formatLabel?: (label: string) => string;
}

// Distinct colors for up to 5 routes + "Other" (gray)
const ROUTE_COLORS = [
  "#f472b6", // pink
  "#60a5fa", // blue
  "#4ade80", // green
  "#fbbf24", // yellow
  "#c084fc", // purple
];
const OTHER_COLOR = "#94a3b8"; // slate gray

function getRouteColor(index: number): string {
  return index < ROUTE_COLORS.length ? ROUTE_COLORS[index] : OTHER_COLOR;
}

export function TokenByRouteChart({ data, routes, darkMode, isHourly, formatLabel }: TokenByRouteChartProps) {
  // All bar keys: top routes + "Other" (if present in data)
  const barKeys = useMemo(() => {
    const keys = [...routes];
    const hasOther = data.some((d) => (d["Other"] as number) > 0);
    if (hasOther) keys.push("Other");
    return keys;
  }, [routes, data]);

  if (!data.length) {
    return (
      <div className={`flex items-center justify-center rounded-xl border border-dashed py-6 ${darkMode ? "border-slate-700 bg-slate-800/30" : "border-slate-300 bg-slate-50"}`}>
        <p className={`text-base ${darkMode ? "text-slate-400" : "text-slate-500"}`}>No route data</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
        <XAxis
          dataKey="label"
          stroke={darkMode ? "#94a3b8" : "#64748b"}
          fontSize={11}
          tickFormatter={isHourly && formatLabel ? formatLabel : undefined}
        />
        <YAxis
          stroke={darkMode ? "#94a3b8" : "#64748b"}
          fontSize={11}
          tickFormatter={(v: number) => formatCompactNumber(v)}
        />
        <Tooltip
          cursor={{ fill: darkMode ? "rgba(148,163,184,0.08)" : "rgba(100,116,139,0.08)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            // Sort by value desc for readability
            const sorted = [...payload].filter((p) => (p.value as number) > 0).sort((a, b) => (b.value as number) - (a.value as number));
            const total = sorted.reduce((acc, p) => acc + (p.value as number), 0);
            return (
              <div
                className="rounded-xl px-4 py-3 shadow-xl backdrop-blur-sm"
                style={{
                  backgroundColor: darkMode ? "rgba(15,23,42,0.7)" : "rgba(255,255,255,0.8)",
                  border: `1px solid ${darkMode ? "rgba(148,163,184,0.4)" : "rgba(203,213,225,0.6)"}`,
                  color: darkMode ? "#f8fafc" : "#0f172a",
                }}
              >
                <p className={`mb-2 text-sm font-medium ${darkMode ? "text-slate-50" : "text-slate-900"}`}>{label}</p>
                <div className="space-y-1 text-sm">
                  {sorted.map((entry) => (
                    <div key={entry.dataKey as string} className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color as string }} />
                      <span style={{ color: entry.color as string }} className="font-medium">{entry.name}:</span>
                      <span className={darkMode ? "text-slate-50" : "text-slate-700"}>{formatNumberWithCommas(entry.value as number)}</span>
                    </div>
                  ))}
                  <div className={`mt-1 border-t pt-1 ${darkMode ? "border-slate-600" : "border-slate-300"}`}>
                    <span className="font-medium">Total: </span>
                    <span>{formatNumberWithCommas(total)}</span>
                  </div>
                </div>
              </div>
            );
          }}
        />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
        {barKeys.map((key, i) => {
          const isLast = i === barKeys.length - 1;
          const color = key === "Other" ? OTHER_COLOR : getRouteColor(i);
          return (
            <Bar
              key={key}
              dataKey={key}
              name={key}
              stackId="routes"
              fill={color}
              fillOpacity={0.85}
              barSize={24}
              radius={isLast ? [4, 4, 0, 0] : undefined}
            />
          );
        })}
      </BarChart>
    </ResponsiveContainer>
  );
}
