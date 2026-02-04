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
  "#DA7756", // terracotta
  "#D4B878", // warm gold
  "#7CC4A0", // sage green
  "#8AABBF", // dusty blue
  "#B8A088", // warm tan
];
const OTHER_COLOR = "#6B6358"; // warm gray

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
      <div className={`flex items-center justify-center rounded-xl border border-dashed py-6 ${darkMode ? "border-[#3d3d3d] bg-[#2a2a2a]/30" : "border-[#D4CCC2] bg-[#FAF9F6]"}`}>
        <p className={`text-base ${darkMode ? "text-[#A39888]" : "text-[#8A7F72]"}`}>No route data</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
        <XAxis
          dataKey="label"
          stroke={darkMode ? "#8A7F72" : "#7A7068"}
          fontSize={11}
          tickFormatter={isHourly && formatLabel ? formatLabel : undefined}
        />
        <YAxis
          stroke={darkMode ? "#8A7F72" : "#7A7068"}
          fontSize={11}
          tickFormatter={(v: number) => formatCompactNumber(v)}
        />
        <Tooltip
          cursor={{ fill: darkMode ? "rgba(163,152,136,0.08)" : "rgba(122,112,104,0.08)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            // Sort by value desc for readability
            const sorted = [...payload].filter((p) => (p.value as number) > 0).sort((a, b) => (b.value as number) - (a.value as number));
            const total = sorted.reduce((acc, p) => acc + (p.value as number), 0);
            return (
              <div
                className="rounded-xl px-4 py-3 shadow-xl backdrop-blur-sm"
                style={{
                  backgroundColor: darkMode ? "rgba(26,26,26,0.85)" : "rgba(250,249,246,0.9)",
                  border: `1px solid ${darkMode ? "rgba(163,152,136,0.4)" : "rgba(212,204,194,0.6)"}`,
                  color: darkMode ? "#E8E0D6" : "#2A2520",
                }}
              >
                <p className={`mb-2 text-sm font-medium ${darkMode ? "text-[#E8E0D6]" : "text-[#2A2520]"}`}>{label}</p>
                <div className="space-y-1 text-sm">
                  {sorted.map((entry) => (
                    <div key={entry.dataKey as string} className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color as string }} />
                      <span style={{ color: entry.color as string }} className="font-medium">{entry.name}:</span>
                      <span className={darkMode ? "text-[#E8E0D6]" : "text-[#3d3d3d]"}>{formatNumberWithCommas(entry.value as number)}</span>
                    </div>
                  ))}
                  <div className={`mt-1 border-t pt-1 ${darkMode ? "border-[#4a4540]" : "border-[#D4CCC2]"}`}>
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
