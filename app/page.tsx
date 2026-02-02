"use client";

import { useEffect, useState, useCallback, useMemo, useRef, startTransition } from "react";
import { ResponsiveContainer, LineChart, Line, Area, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar, Legend, ComposedChart, PieChart, Pie, Cell } from "recharts";
import type { TooltipProps } from "recharts";
import { formatCurrency, formatNumber, formatCompactNumber, formatNumberWithCommas, formatHourLabel } from "@/lib/utils";
import { AlertTriangle, Info, LucideIcon, Activity, RefreshCw, Moon, Sun, Maximize2, CalendarRange, X } from "lucide-react";
import type { UsageOverview, UsageSeriesPoint, RouteUsage, RouteTokenSeriesPoint } from "@/lib/types";
import { Modal } from "@/app/components/Modal";
import { TokenByRouteChart } from "@/app/components/token-by-route-chart";

// Pie chart colors - soft palette
const PIE_COLORS = ["#60a5fa", "#4ade80", "#fbbf24", "#c084fc", "#f472b6", "#38bdf8", "#a3e635", "#fb923c"];

type OverviewMeta = { page: number; pageSize: number; totalModels: number; totalPages: number };
type TokensByRouteData = { byDay: RouteTokenSeriesPoint[]; byHour: RouteTokenSeriesPoint[]; routes: string[] };
type OverviewAPIResponse = { overview: UsageOverview | null; empty: boolean; days: number; meta?: OverviewMeta; filters?: { models: string[]; routes: string[] }; topRoutes?: RouteUsage[]; tokensByRoute?: TokensByRouteData; timezone?: string };

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDateInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

type TooltipValue = number | string | Array<number | string> | undefined;

function normalizeTooltipValue(value: TooltipValue) {
  if (Array.isArray(value)) return normalizeTooltipValue(value[0]);
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

const trendTooltipFormatter: TooltipProps<number, string>["formatter"] = (value, name) => {
  const numericValue = normalizeTooltipValue(value);
  return name === "Cost" ? [formatCurrency(numericValue), name] : [formatNumberWithCommas(numericValue), name];
};

const numericTooltipFormatter: TooltipProps<number, string>["formatter"] = (value, name) => {
  const numericValue = normalizeTooltipValue(value);
  return [formatNumberWithCommas(numericValue), name];
};


export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [overview, setOverview] = useState<UsageOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewEmpty, setOverviewEmpty] = useState(false);
  const [topRoutes, setTopRoutes] = useState<RouteUsage[]>([]);
  const [tokensByRoute, setTokensByRoute] = useState<TokensByRouteData | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [rangeInit] = useState(() => {
    const defaultEnd = new Date();
    const defaultStart = new Date(defaultEnd.getTime() - 6 * DAY_MS);
    const fallback = { mode: "preset" as const, days: 1, start: formatDateInputValue(defaultStart), end: formatDateInputValue(defaultEnd) };
    if (typeof window === "undefined") return fallback;
    const saved = window.localStorage.getItem("rangeSelection");
    if (!saved) return fallback;
    try {
      const parsed = JSON.parse(saved) as { mode?: "preset" | "custom"; days?: number; start?: string; end?: string };
      if (!parsed || (parsed.mode !== "preset" && parsed.mode !== "custom")) return fallback;
      return {
        mode: parsed.mode,
        days: Number.isFinite(parsed.days) ? Math.max(1, Number(parsed.days)) : fallback.days,
        start: parsed.start || fallback.start,
        end: parsed.end || fallback.end
      };
    } catch (err) {
      console.warn("Failed to parse saved rangeSelection", err);
      return fallback;
    }
  });
  const [rangeMode, setRangeMode] = useState<"preset" | "custom">(rangeInit.mode);
  const [rangeDays, setRangeDays] = useState(rangeInit.days);
  const [customStart, setCustomStart] = useState(rangeInit.start);
  const [customEnd, setCustomEnd] = useState(rangeInit.end);
  const [appliedDays, setAppliedDays] = useState(rangeInit.days);
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [customDraftStart, setCustomDraftStart] = useState(rangeInit.start);
  const [customDraftEnd, setCustomDraftEnd] = useState(rangeInit.end);
  const [customError, setCustomError] = useState<string | null>(null);
  const customPickerRef = useRef<HTMLDivElement | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [routeOptions, setRouteOptions] = useState<string[]>([]);
  const [filterModelInput, setFilterModelInput] = useState("");
  const [filterRouteInput, setFilterRouteInput] = useState("");
  const [filterModel, setFilterModel] = useState<string | undefined>(undefined);
  const [filterRoute, setFilterRoute] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const saveStatusTimerRef = useRef<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const syncStatusTimerRef = useRef<number | null>(null);
  const [syncStatusClosing, setSyncStatusClosing] = useState(false);
  const [saveStatusClosing, setSaveStatusClosing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = window.localStorage.getItem("lastSyncTime");
    return saved ? new Date(saved) : null;
  });
  const [lastInsertedDelta, setLastInsertedDelta] = useState(() => {
    if (typeof window === "undefined") return 0;
    const saved = window.localStorage.getItem("lastInsertedDelta");
    const parsed = saved ? Number.parseInt(saved, 10) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [ready, setReady] = useState(false);
  const [pieMode, setPieMode] = useState<"tokens" | "requests">("tokens");
  const [routesSortMode, setRoutesSortMode] = useState<"tokens" | "cost">("tokens");
  const [darkMode, setDarkMode] = useState(true);
  const [fullscreenChart, setFullscreenChart] = useState<"trend" | "pie" | "stacked" | null>(null);
  const [hoveredPieIndex, setHoveredPieIndex] = useState<number | null>(null);
  const [pieTooltipOpen, setPieTooltipOpen] = useState(false);
  const pieChartContainerRef = useRef<HTMLDivElement | null>(null);
  const pieChartFullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const pieLegendClearTimerRef = useRef<number | null>(null);
  const syncingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "rangeSelection",
      JSON.stringify({ mode: rangeMode, days: rangeDays, start: customStart, end: customEnd })
    );
  }, [rangeMode, rangeDays, customStart, customEnd]);

  const [trendVisible, setTrendVisible] = useState<Record<string, boolean>>({
    requests: true,
    tokens: true,
    cost: true,
  });

  const [hourlyVisible, setHourlyVisible] = useState<Record<string, boolean>>({
    requests: true,
    inputTokens: true,
    outputTokens: true,
    reasoningTokens: true,
    cachedTokens: true,
  });

  const [fullscreenHourlyMode, setFullscreenHourlyMode] = useState<"bar" | "area">("area");

  const handleTrendLegendClick = (e: any) => {
    const { dataKey } = e;
    setTrendVisible((prev) => ({
      ...prev,
      [dataKey]: !prev[dataKey as string],
    }));
  };

  const handleHourlyLegendClick = (e: any, _index?: any, event?: any) => {
    const key = e.dataKey ?? e.payload?.dataKey ?? e.id;
    if (!key) return;
    
    // Check for Ctrl/Cmd + left click
    const nativeEvent = event?.nativeEvent || event;
    const isModifierClick = nativeEvent && (nativeEvent.ctrlKey || nativeEvent.metaKey);

    if (isModifierClick) {
      // Ctrl/Cmd + left click: show only current item or restore all
      const allOthersHidden = Object.keys(hourlyVisible).every(k => k === key || !hourlyVisible[k]);

      if (allOthersHidden) {
        // If all others are hidden, restore all
        setHourlyVisible({
          requests: true,
          inputTokens: true,
          outputTokens: true,
          reasoningTokens: true,
          cachedTokens: true,
        });
      } else {
        // Hide others, show only current item
        setHourlyVisible({
          requests: key === "requests",
          inputTokens: key === "inputTokens",
          outputTokens: key === "outputTokens",
          reasoningTokens: key === "reasoningTokens",
          cachedTokens: key === "cachedTokens",
        });
      }
    } else {
      // Left click: toggle current item
      setHourlyVisible((prev) => ({
        ...prev,
        [key]: !prev[key as string],
      }));
    }
  };

  const TrendLegend: any = Legend;

  const trendConfig = useMemo(() => {
    const defs = {
      requests: { color: darkMode ? "#60a5fa" : "#3b82f6", formatter: (v: any) => formatCompactNumber(v), name: "Requests" },
      tokens: { color: darkMode ? "#4ade80" : "#16a34a", formatter: (v: any) => formatCompactNumber(v), name: "Tokens" },
      cost: { color: "#fbbf24", formatter: (v: any) => formatCurrency(v), name: "Cost" },
    };

    const visibleKeys = (Object.keys(trendVisible) as Array<keyof typeof trendVisible>).filter((k) => trendVisible[k]);

    // Cost always uses cost axis to avoid axis switching and re-rendering
    let lineAxisMap: Record<string, string> = {
      requests: "left",
      tokens: "right",
      cost: "cost",
    };

    let leftAxisKey = "requests";
    let rightAxisKey = "tokens";
    let rightAxisVisible = true;

    if (visibleKeys.length === 2) {
      if (!trendVisible.requests) {
        // requests hidden -> tokens (left), cost (cost)
        lineAxisMap = { requests: "left", tokens: "left", cost: "cost" };
        leftAxisKey = "tokens";
        rightAxisKey = "tokens";
        rightAxisVisible = false;
      } else if (!trendVisible.tokens) {
        // tokens hidden -> requests (left), cost (cost)
        lineAxisMap = { requests: "left", tokens: "right", cost: "cost" };
        leftAxisKey = "requests";
        rightAxisKey = "requests";
        rightAxisVisible = false;
      } else {
        // cost hidden -> requests (left), tokens (right)
        lineAxisMap = { requests: "left", tokens: "right", cost: "cost" };
        leftAxisKey = "requests";
        rightAxisKey = "tokens";
      }
    } else if (visibleKeys.length === 1) {
      const key = visibleKeys[0];
      lineAxisMap = { requests: "left", tokens: "left", cost: "cost" };
      leftAxisKey = key;
      rightAxisVisible = false;
    } else if (visibleKeys.length === 0) {
       rightAxisVisible = false;
    }

    return {
      lineAxisMap,
      leftAxis: defs[leftAxisKey as keyof typeof defs],
      rightAxis: defs[rightAxisKey as keyof typeof defs],
      rightAxisVisible
    };
  }, [trendVisible, darkMode]);

  const cancelPieLegendClear = useCallback(() => {
    if (pieLegendClearTimerRef.current !== null) {
      window.clearTimeout(pieLegendClearTimerRef.current);
      pieLegendClearTimerRef.current = null;
    }
  }, []);

  const schedulePieLegendClear = useCallback(() => {
    cancelPieLegendClear();
    pieLegendClearTimerRef.current = window.setTimeout(() => {
      setHoveredPieIndex(null);
      pieLegendClearTimerRef.current = null;
    }, 60); // Pie legend hover delay to avoid flickering
  }, [cancelPieLegendClear]);

  useEffect(() => {
    if (!pieTooltipOpen) return;

    const isInsideRect = (rect: DOMRect | undefined | null, x: number, y: number) => {
      if (!rect) return false;
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };

    const closeTooltip = () => {
      cancelPieLegendClear();
      setPieTooltipOpen(false);
      setHoveredPieIndex(null);
    };

    const onPointerMove = (e: PointerEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      const mainRect = pieChartContainerRef.current?.getBoundingClientRect();
      const fsRect = pieChartFullscreenContainerRef.current?.getBoundingClientRect();
      const inside = isInsideRect(mainRect, x, y) || isInsideRect(fsRect, x, y);
      if (!inside) closeTooltip();
    };

    const onWindowBlur = () => closeTooltip();

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [pieTooltipOpen, cancelPieLegendClear]);

  // Close syncStatus toast
  const closeSyncStatus = useCallback(() => {
    setSyncStatusClosing(true);
    setTimeout(() => {
      setSyncStatus(null);
      setSyncStatusClosing(false);
    }, 400);
  }, []);

  // Close saveStatus toast
  const closeSaveStatus = useCallback(() => {
    setSaveStatusClosing(true);
    setTimeout(() => {
      setSaveStatus(null);
      setSaveStatusClosing(false);
    }, 400);
  }, []);

  // Auto-clear syncStatus toast
  useEffect(() => {
    if (!syncStatus) return;

    if (syncStatusTimerRef.current !== null) {
      window.clearTimeout(syncStatusTimerRef.current);
    }

    syncStatusTimerRef.current = window.setTimeout(() => {
      closeSyncStatus();
      syncStatusTimerRef.current = null;
    }, 10000);

    return () => {
      if (syncStatusTimerRef.current !== null) {
        window.clearTimeout(syncStatusTimerRef.current);
        syncStatusTimerRef.current = null;
      }
    };
  }, [syncStatus, closeSyncStatus]);

  // Auto-clear saveStatus toast
  useEffect(() => {
    if (!saveStatus) return;

    if (saveStatusTimerRef.current !== null) {
      window.clearTimeout(saveStatusTimerRef.current);
    }

    saveStatusTimerRef.current = window.setTimeout(() => {
      closeSaveStatus();
      saveStatusTimerRef.current = null;
    }, 10000);

    return () => {
      if (saveStatusTimerRef.current !== null) {
        window.clearTimeout(saveStatusTimerRef.current);
        saveStatusTimerRef.current = null;
      }
    };
  }, [saveStatus, closeSaveStatus]);

  const applyTheme = useCallback((nextDark: boolean) => {
    setDarkMode(nextDark);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", nextDark);
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("theme", nextDark ? "dark" : "light");
    }
  }, []);

  // Execute data synchronization
  const doSync = useCallback(async (showMessage = true, triggerRefresh = true, timeout = 60000) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncStatus(null);
    try {
      // Create timeout controller (default 60s, 5s for initial load)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const res = await fetch("/api/sync", {
        method: "POST",
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (!res.ok) {
        const errorMsg = `Sync failed: ${data.error || res.statusText}`;
        setSyncStatus(errorMsg);
        if (typeof window !== "undefined") {
          window.localStorage.setItem("lastSyncStatus", errorMsg);
        }
      } else {
        const now = new Date();
        const inserted = data.inserted ?? 0;
        setLastSyncTime(now);
        if (typeof window !== "undefined") {
          window.localStorage.setItem("lastSyncTime", now.toISOString());
        }
        setLastInsertedDelta((prev) => {
          const safePrev = Number.isFinite(prev) ? prev : 0;
          const next = inserted > 0 ? inserted : safePrev;
          if ((inserted > 0 || !Number.isFinite(prev)) && typeof window !== "undefined") {
            window.localStorage.setItem("lastInsertedDelta", String(next));
          }
          return next;
        });
        // Always show message for manual sync, show only when data exists for auto sync
        const shouldShowMessage = showMessage || inserted > 0;
        if (shouldShowMessage) {
          const successMsg = `Synced ${inserted} records`;
          setSyncStatus(successMsg);
          if (typeof window !== "undefined") {
            window.localStorage.setItem("lastSyncStatus", successMsg);
          }
        }
        if (triggerRefresh && inserted > 0) setRefreshTrigger((prev) => prev + 1);
      }
    } catch (err) {
      // Check if it's a timeout error
      const isTimeout = (err as Error).name === "AbortError";
      const errorMsg = isTimeout
        ? "Sync timeout: Data synchronization may take longer, please refresh manually later"
        : `Sync failed: ${(err as Error).message}`;
      setSyncStatus(errorMsg);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("lastSyncStatus", errorMsg);
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  // Auto-sync once per session on page load
  useEffect(() => {
    let active = true;
    const autoSyncKey = "cli_dashboard_auto_sync_done";
    const hasSyncedThisSession = typeof window !== "undefined" ? window.sessionStorage.getItem(autoSyncKey) : null;

    if (hasSyncedThisSession) {
      setReady(true);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      try {
        await doSync(true, false, 5000); // 5s timeout for initial load
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(autoSyncKey, "1");
        }
      } finally {
        if (active) setReady(true);
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [doSync]);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("theme") : null;
    const prefersDark = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : true;
    const initial = saved ? saved === "dark" : prefersDark;
    applyTheme(initial);
  }, [applyTheme]);

  useEffect(() => {
    if (!customPickerOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (customPickerRef.current && !customPickerRef.current.contains(target)) {
        setCustomPickerOpen(false);
        setCustomError(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [customPickerOpen]);

  useEffect(() => {
    if (!ready) return;
    if (rangeMode === "custom" && (!customStart || !customEnd)) return;

    const controller = new AbortController();
    let active = true;

    const loadOverview = async () => {
      setLoadingOverview(true);
      try {
        const params = new URLSearchParams();
        if (rangeMode === "custom") {
          params.set("start", customStart);
          params.set("end", customEnd);
        } else if (rangeDays === 1) {
          // "Today" - from midnight today to now
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          params.set("start", formatDateInputValue(today));
          params.set("end", formatDateInputValue(new Date()));
        } else {
          params.set("days", String(rangeDays));
        }
        if (filterModel) params.set("model", filterModel);
        if (filterRoute) params.set("route", filterRoute);
        params.set("page", String(page));
        params.set("pageSize", "500");

        const res = await fetch(`/api/overview?${params.toString()}`, { cache: "no-store", signal: controller.signal });

        if (!res.ok) {
          if (active) {
            setOverviewError("Unable to load usage data: " + res.statusText);
            setOverview(null);
          }
          return;
        }
        const data: OverviewAPIResponse = await res.json();
        if (!active) return;
        setOverview(data.overview ?? null);
        setOverviewEmpty(Boolean(data.empty));
        setOverviewError(null);
        setPage(data.meta?.page ?? 1);
        setModelOptions(Array.from(new Set(data.filters?.models ?? [])));
        setRouteOptions(Array.from(new Set(data.filters?.routes ?? [])));
        setAppliedDays(data.days ?? rangeDays);
        setTopRoutes(data.topRoutes ?? []);
        setTokensByRoute(data.tokensByRoute ?? null);
      } catch (err) {
        if (!active) return;
        const error = err as Error;
        if ((error as any)?.name === "AbortError") return;
        setOverviewError("Unable to load usage data: " + error.message);
        setOverview(null);
      } finally {
        if (active) setLoadingOverview(false);
      }
    };
    loadOverview();
    return () => {
      active = false;
      controller.abort();
    };
  }, [rangeMode, customStart, customEnd, rangeDays, filterModel, filterRoute, page, refreshTrigger, ready]);

  const overviewData = overview;
  const showEmpty = overviewEmpty || !overview;

  const sortedTopRoutes = useMemo(() => {
    if (!topRoutes.length) return [];
    return [...topRoutes].sort((a, b) =>
      routesSortMode === "tokens" ? b.tokens - a.tokens : b.cost - a.cost
    );
  }, [topRoutes, routesSortMode]);

  // Usage Trend data: hourly for "Today", daily for other ranges
  const trendData = useMemo(() => {
    if (!overviewData) return [];
    return rangeDays === 1 ? overviewData.byHour : overviewData.byDay;
  }, [overviewData, rangeDays]);

  // Token by Route chart data: hourly for "Today", daily for other ranges
  const tokenByRouteData = useMemo(() => {
    if (!tokensByRoute) return [];
    return rangeDays === 1 ? tokensByRoute.byHour : tokensByRoute.byDay;
  }, [tokensByRoute, rangeDays]);

  const tokenByRouteNames = useMemo(() => {
    return tokensByRoute?.routes ?? [];
  }, [tokensByRoute]);

  // Load Distribution data: same logic as trendData
  const loadDistributionData = useMemo(() => {
    if (!overviewData) return [];
    return rangeDays === 1 ? overviewData.byHour : overviewData.byDay;
  }, [overviewData, rangeDays]);

  // Check if showing hourly data (for label formatting)
  const isHourlyView = rangeDays === 1;

  // Format label for hourly view - show only hour for Today, full date+hour otherwise
  const formatLabel = useCallback((label: string) => formatHourLabel(label, true), []);

  useEffect(() => {
    if (fullscreenChart === "stacked") {
      setFullscreenHourlyMode("area");
    }
  }, [fullscreenChart]);

  const sortedModelsByCost = useMemo(() => {
    const models = overviewData?.models ?? [];
    return [...models].sort((a, b) => b.cost - a.cost);
  }, [overviewData]);

  // Calculate actual data duration (from earliest record to now)
  const actualTimeSpan = useMemo(() => {
    if (!overviewData?.byHour || overviewData.byHour.length === 0) {
      return { days: appliedDays, minutes: appliedDays * 24 * 60 };
    }

    // Find earliest timestamp
    let earliestTime: Date | null = null;
    for (const point of overviewData.byHour) {
      if (point.timestamp) {
        const t = new Date(point.timestamp);
        if (Number.isFinite(t.getTime())) {
          if (!earliestTime || t < earliestTime) {
            earliestTime = t;
          }
        }
      }
    }

    if (!earliestTime) {
      return { days: appliedDays, minutes: appliedDays * 24 * 60 };
    }

    // Calculate duration from earliest record to now
    const now = new Date();
    const diffMs = now.getTime() - earliestTime.getTime();
    const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    const diffDays = Math.max(1, diffMinutes / (24 * 60));

    return { days: diffDays, minutes: diffMinutes };
  }, [overviewData?.byHour, appliedDays]);

  const rangeSubtitle = useMemo(() => {
    if (rangeMode === "custom" && customStart && customEnd) {
      return `${customStart} ~ ${customEnd} (${appliedDays} days)`;
    }
    if (rangeDays === 1) {
      return "Today";
    }
    return `Last ${appliedDays} days`;
  }, [rangeMode, customStart, customEnd, appliedDays, rangeDays]);


  const applyFilters = () => {
    setPage(1);
    setFilterModel(filterModelInput.trim() || undefined);
    setFilterRoute(filterRouteInput.trim() || undefined);
  };

  const applyModelOption = (val: string) => {
    setFilterModelInput(val);
    setFilterModel(val.trim() || undefined);
    setPage(1);
  };

  const applyRouteOption = (val: string) => {
    setFilterRouteInput(val);
    setFilterRoute(val.trim() || undefined);
    setPage(1);
  };

  return (
    <main className={`min-h-screen px-6 py-8 transition-colors ${darkMode ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"}`}>
      {overviewError ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Load Failed</p>
            <p className="text-red-300">{overviewError}</p>
          </div>
        </div>
      ) : null}

      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className={`text-2xl font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>Usage Dashboard</h1>
          <p className={`text-base ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Persistent CLIProxyAPI Usage Statistics & Cost Analysis</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => applyTheme(!darkMode)}
            className={`rounded-lg border p-2 transition ${
              darkMode
                ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
            }`}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={() => doSync(true)}
            disabled={syncing}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              syncing
                ? darkMode
                  ? "cursor-not-allowed border-slate-700 bg-slate-800 text-slate-500"
                  : "cursor-not-allowed border-slate-300 bg-slate-200 text-slate-500"
                : "border-indigo-500/50 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30"
            }`}
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Refresh Data"}
          </button>
          <div className="flex flex-col items-end gap-0.5">
            <div className={`flex items-center gap-2 text-sm ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
              <Activity className="h-4 w-4" />
              {loadingOverview ? "Loading..." : overview ? "Live Data" : "No Data"}
            </div>
            {mounted && lastSyncTime && (
              <span className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-500"}`}>
                Last sync: {lastSyncTime.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="text-sm uppercase tracking-wide text-slate-500">Time Range</span>
        {[1, 7, 14, 30].map((days) => (
          <button
            key={days}
            onClick={() => {
              setRangeMode("preset");
              setRangeDays(days);
              setPage(1);
              setCustomPickerOpen(false);
            }}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
              mounted && rangeMode === "preset" && rangeDays === days
                ? "border-indigo-500 bg-indigo-600 text-white"
                : darkMode ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
            }`}
          >
            {days === 1 ? "Today" : `Last ${days} days`}
          </button>
        ))}
        <div className="relative" ref={customPickerRef}>
          <button
            onClick={() => {
              setCustomPickerOpen((open) => !open);
              setCustomDraftStart(customStart);
              setCustomDraftEnd(customEnd);
            }}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
              rangeMode === "custom"
                ? "border-indigo-500 bg-indigo-600 text-white"
                : darkMode ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
            }`}
          >
            Custom
          </button>
          {customPickerOpen ? (
            <div
              className={`absolute z-30 mt-2 w-72 rounded-xl border p-4 shadow-2xl ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"}`}
            >
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-1 gap-2">
                  <label className={darkMode ? "text-slate-300" : "text-slate-700"}>
                    Start Date
                    <input
                      type="date"
                      className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none ${darkMode ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-900"}`}
                      value={customDraftStart}
                      max={customDraftEnd || undefined}
                      onChange={(e) => setCustomDraftStart(e.target.value)}
                    />
                  </label>
                  <label className={darkMode ? "text-slate-300" : "text-slate-700"}>
                    End Date
                    <input
                      type="date"
                      className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none ${darkMode ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-900"}`}
                      value={customDraftEnd}
                      min={customDraftStart || undefined}
                      onChange={(e) => setCustomDraftEnd(e.target.value)}
                    />
                  </label>
                </div>
                {customError ? (
                  <p className="text-xs text-red-400">{customError}</p>
                ) : null}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomPickerOpen(false);
                      setCustomError(null);
                      setCustomDraftStart(customStart);
                      setCustomDraftEnd(customEnd);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${darkMode ? "text-slate-300 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-100"}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!customDraftStart || !customDraftEnd) {
                        setCustomError("Please select start and end dates");
                        return;
                      }
                      const startDate = new Date(customDraftStart);
                      const endDate = new Date(customDraftEnd);
                      if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
                        setCustomError("Invalid date");
                        return;
                      }
                      if (endDate < startDate) {
                        setCustomError("End date must not be earlier than start date");
                        return;
                      }
                      setCustomError(null);
                      setCustomStart(customDraftStart);
                      setCustomEnd(customDraftEnd);
                      setRangeMode("custom");
                      setPage(1);
                      setCustomPickerOpen(false);
                      setRefreshTrigger((prev) => prev + 1);
                    }}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        {rangeMode === "custom" ? (
          <div
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
              darkMode
                ? "border-slate-700 bg-slate-800 text-slate-200 shadow-[0_4px_20px_rgba(15,23,42,0.35)]"
                : "border-slate-200 bg-white text-slate-700 shadow-[0_8px_30px_rgba(15,23,42,0.08)]"
            }`}
          >
            <CalendarRange className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
            <span className="whitespace-nowrap">{rangeSubtitle}</span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <ComboBox
            value={filterModelInput}
            onChange={setFilterModelInput}
            options={modelOptions}
            placeholder="Filter by model"
            darkMode={darkMode}
            onSelectOption={applyModelOption}
            onClear={() => {
              setFilterModelInput("");
              setFilterModel(undefined);
              setPage(1);
            }}
          />
          <ComboBox
            value={filterRouteInput}
            onChange={setFilterRouteInput}
            options={routeOptions}
            placeholder="Filter by key"
            darkMode={darkMode}
            onSelectOption={applyRouteOption}
            onClear={() => {
              setFilterRouteInput("");
              setFilterRoute(undefined);
              setPage(1);
            }}
          />
          <button
            onClick={applyFilters}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${darkMode ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"}`}
          >
            Apply Filters
          </button>
          {(filterModel || filterRoute) ? (
            <button
              onClick={() => {
                setFilterModelInput("");
                setFilterRouteInput("");
                setFilterModel(undefined);
                setFilterRoute(undefined);
                setPage(1);
              }}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${darkMode ? "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500" : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"}`}
            >
              Clear
            </button>
          ) : null}
        </div>
        {loadingOverview ? <span className="text-sm text-slate-400">Loading...</span> : null}
        {/* {showEmpty ? <span className="text-sm text-slate-400">No data, please sync first</span> : null} */}
      </div>

      {/* Stats cards - single row */}
      <section className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        {loadingOverview || !overviewData ? (
          <>
            {/* Requests skeleton */}
            <Skeleton className="h-28 rounded-2xl" />
            {/* Tokens skeleton - 2 columns */}
            <Skeleton className="col-span-2 h-28 rounded-2xl" />
            {/* Success rate skeleton */}
            <Skeleton className="h-28 rounded-2xl" />
            {/* TPM skeleton */}
            <Skeleton className="h-28 rounded-2xl" />
            {/* RPM skeleton */}
            <Skeleton className="h-28 rounded-2xl" />
            {/* Cost skeleton */}
            <Skeleton className="h-28 rounded-2xl" />
          </>
        ) : (
          <>
            {/* Requests */}
            <div className={`animate-card-float rounded-2xl p-5 shadow-sm ring-1 transition-all duration-200 ${darkMode ? "bg-slate-800/50 ring-slate-700 hover:shadow-lg hover:shadow-slate-700/30 hover:ring-slate-600" : "bg-white ring-slate-200 hover:shadow-lg hover:ring-slate-300"}`} style={{ animationDelay: '0.05s' }}>
              <div className={`text-sm uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Requests</div>
              <div className={`mt-3 text-2xl font-semibold ${darkMode ? "text-white" : "text-slate-900"}`}>
                {formatNumberWithCommas(overviewData.totalRequests)}
                {lastInsertedDelta > 0 ? (
                  <span className={`ml-2 text-sm font-normal ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                    (+{formatCompactNumber(lastInsertedDelta)})
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm">
                <span className="text-emerald-400">✓ {formatCompactNumber(overviewData.successCount)}</span>
                <span className={`mx-2 ${darkMode ? "text-slate-500" : "text-slate-400"}`}>|</span>
                <span className="text-red-400">✗ {formatCompactNumber(overviewData.failureCount)}</span>
              </p>
            </div>
            
            {/* Tokens - spans 2 columns */}
            <div className={`animate-card-float col-span-2 rounded-2xl p-5 shadow-sm ring-1 transition-all duration-200 ${darkMode ? "bg-slate-800/50 ring-slate-700 hover:shadow-lg hover:shadow-slate-700/30 hover:ring-slate-600" : "bg-white ring-slate-200 hover:shadow-lg hover:ring-slate-300"}`} style={{ animationDelay: '0.1s' }}>
              <div className="flex items-center justify-between">
                <div className={`text-sm uppercase tracking-wide ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Tokens</div>
                <div className={`text-2xl font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>
                  {formatNumberWithCommas(overviewData.totalTokens)}
                  <span className={`ml-2 text-lg font-normal ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                    ({formatCompactNumber(overviewData.totalTokens)})
                  </span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className={darkMode ? "text-slate-400" : "text-slate-500"}>Input</span>
                  <span className="font-medium" style={{ color: darkMode ? "#fb7185" : "#e11d48" }}>{formatNumberWithCommas(overviewData.totalInputTokens)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={darkMode ? "text-slate-400" : "text-slate-500"}>Output</span>
                  <span className="font-medium" style={{ color: darkMode ? "#4ade80" : "#16a34a" }}>{formatNumberWithCommas(overviewData.totalOutputTokens)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={darkMode ? "text-slate-400" : "text-slate-500"}>Reasoning</span>
                  <span className="font-medium" style={{ color: darkMode ? "#fbbf24" : "#d97706" }}>{formatNumberWithCommas(overviewData.totalReasoningTokens)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={darkMode ? "text-slate-400" : "text-slate-500"}>Cached</span>
                  <span className="font-medium" style={{ color: darkMode ? "#c084fc" : "#9333ea" }}>{formatNumberWithCommas(overviewData.totalCachedTokens)}</span>
                </div>
              </div>
            </div>
            
            {/* Estimated Cost */}
            <div className={`animate-card-float rounded-2xl p-5 shadow-sm ring-1 transition-all duration-200 ${darkMode ? "bg-gradient-to-br from-amber-500/20 to-amber-700/10 ring-amber-400/40 hover:shadow-lg hover:shadow-amber-500/20 hover:ring-amber-400/60" : "bg-amber-50 ring-amber-200 hover:shadow-lg hover:ring-amber-300"}`} style={{ animationDelay: '0.15s' }}>
              <div className="text-sm uppercase tracking-wide text-amber-400">Estimated Cost</div>
              <div className={`mt-3 text-2xl font-semibold ${darkMode ? "text-white" : "text-slate-900"}`}>{formatCurrency(overviewData.totalCost)}</div>
              <p className={`mt-2 text-xs ${darkMode ? "text-amber-300/70" : "text-amber-700/70"}`}>Based on model prices</p>
            </div>

            {/* TPM */}
            <div className={`animate-card-float rounded-2xl p-5 shadow-sm ring-1 transition-all duration-200 ${darkMode ? "bg-gradient-to-br from-emerald-600/20 to-emerald-800/10 ring-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/20 hover:ring-emerald-500/50" : "bg-emerald-50 ring-emerald-200 hover:shadow-lg hover:ring-emerald-300"}`} style={{ animationDelay: '0.2s' }}>
              <div className="text-sm uppercase tracking-wide text-emerald-400">Avg TPM</div>
              <div className={`mt-3 text-2xl font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>
                {formatNumber(overviewData.totalTokens / actualTimeSpan.minutes)}
              </div>
              <p className={`mt-2 text-xs ${darkMode ? "text-emerald-300/70" : "text-emerald-600/70"}`}>Tokens per minute</p>
            </div>

            {/* RPM */}
            <div className={`animate-card-float rounded-2xl p-5 shadow-sm ring-1 transition-all duration-200 ${darkMode ? "bg-gradient-to-br from-blue-600/20 to-blue-800/10 ring-blue-500/30 hover:shadow-lg hover:shadow-blue-500/20 hover:ring-blue-500/50" : "bg-blue-50 ring-blue-200 hover:shadow-lg hover:ring-blue-300"}`} style={{ animationDelay: '0.25s' }}>
              <div className="text-sm uppercase tracking-wide text-blue-400">Avg RPM</div>
              <div className={`mt-3 text-2xl font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>
                {formatNumber(overviewData.totalRequests / actualTimeSpan.minutes)}
              </div>
              <p className={`mt-2 text-xs ${darkMode ? "text-blue-300/70" : "text-blue-600/70"}`}>Requests per minute</p>
            </div>

            {/* Avg daily Requests */}
            <div className={`animate-card-float rounded-2xl p-5 shadow-sm ring-1 transition-all duration-200 ${darkMode ? "bg-gradient-to-br from-purple-600/20 to-purple-800/10 ring-purple-500/30 hover:shadow-lg hover:shadow-purple-500/20 hover:ring-purple-500/50" : "bg-purple-50 ring-purple-200 hover:shadow-lg hover:ring-purple-300"}`} style={{ animationDelay: '0.3s' }}>
              <div className="text-sm uppercase tracking-wide text-purple-400">Avg Daily Requests (RPD)</div>
              <div className={`mt-3 text-2xl font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>
                {formatCompactNumber(Math.round(overviewData.totalRequests / actualTimeSpan.days))}
              </div>
              <p className={`mt-2 text-xs ${darkMode ? "text-purple-300/70" : "text-purple-600/70"}`}>Requests per day</p>
            </div>
          </>
        )}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-5">
        {loadingOverview || !overviewData ? (
          <div className="lg:col-span-3">
            <Skeleton className="h-[400px] rounded-2xl" />
          </div>
        ) : (
          <div className={`animate-card-float rounded-2xl p-6 shadow-sm ring-1 lg:col-span-3 flex flex-col ${darkMode ? "bg-slate-800/50 ring-slate-700" : "bg-white ring-slate-200"}`} style={{ animationDelay: '0.15s' }}>
            <div className="flex items-center justify-between">
              <h2 className={`text-lg font-semibold ${darkMode ? "text-white" : "text-slate-900"}`}>Usage Trend</h2>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{rangeSubtitle}</span>
                <button
                  type="button"
                  onClick={() => setFullscreenChart("trend")}
                  className={`rounded-lg p-1.5 transition ${darkMode ? "text-slate-400 hover:bg-slate-700 hover:text-white" : "text-slate-500 hover:bg-slate-200 hover:text-slate-900"}`}
                  title="View fullscreen"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-4 flex-1 min-h-64">
              {showEmpty ? (
                <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-800/30 text-center">
                  <p className="text-base text-slate-400">No chart data</p>
                  <p className="mt-1 text-sm text-slate-500">Please trigger /api/sync to sync data first</p>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#334155" strokeDasharray="5 5" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} tickFormatter={isHourlyView ? formatLabel : undefined} />
                  <YAxis 
                    yAxisId="left" 
                    stroke={trendConfig.leftAxis.color} 
                    tickFormatter={trendConfig.leftAxis.formatter} 
                    fontSize={12} 
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke={trendConfig.rightAxis.color}
                    tickFormatter={trendConfig.rightAxis.formatter}
                    fontSize={12}
                    hide={!trendConfig.rightAxisVisible}
                  />
                  <YAxis
                    yAxisId="cost"
                    orientation="right"
                    stroke="#fbbf24"
                    tickFormatter={(v) => formatCurrency(v)}
                    fontSize={12}
                    hide={!trendVisible.cost || (trendVisible.requests && trendVisible.tokens)}
                    width={trendVisible.cost && (!trendVisible.requests || !trendVisible.tokens) ? undefined : 0}
                  />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const sortedPayload = [...payload].sort((a: any, b: any) => {
                        const order: Record<string, number> = { requests: 0, tokens: 1, cost: 2 };
                        return (order[a.dataKey] ?? 999) - (order[b.dataKey] ?? 999);
                      });
                      return (
                        <div 
                          className="rounded-xl px-4 py-3 shadow-xl backdrop-blur-sm"
                          style={{ 
                            backgroundColor: darkMode ? "rgba(15, 23, 42, 0.7)" : "rgba(255, 255, 255, 0.8)", 
                            border: `1px solid ${darkMode ? "rgba(148, 163, 184, 0.4)" : "rgba(203, 213, 225, 0.6)"}`,
                            color: darkMode ? "#f8fafc" : "#0f172a"
                          }}
                        >
                          <p className={`mb-2 font-medium text-sm ${darkMode ? "text-slate-50" : "text-slate-900"}`}>{label}</p>
                          <div className="space-y-1">
                            {sortedPayload.map((entry: any, index: number) => {
                              let color = entry.color;
                              if (entry.name === "Requests") color = darkMode ? "#60a5fa" : "#3b82f6";
                              if (entry.name === "Tokens") color = darkMode ? "#4ade80" : "#16a34a";
                              if (entry.name === "Cost") color = "#fbbf24";
                              
                              const value = entry.name === "Cost" ? formatCurrency(entry.value) : formatNumberWithCommas(entry.value);
                              
                              return (
                                <div key={index} className="flex items-center gap-2 text-sm">
                                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                                  <span style={{ color: color }} className="font-medium">
                                    {entry.name}:
                                  </span>
                                  <span className={darkMode ? "text-slate-50" : "text-slate-700"}>
                                    {value}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <TrendLegend 
                    height={24} 
                    iconSize={10} 
                    wrapperStyle={{ paddingTop: 0, paddingBottom: 0, lineHeight: "24px", cursor: "pointer" }} 
                    onClick={handleTrendLegendClick}
                    formatter={(value: string) => {
                      const keyMap: Record<string, string> = { "Requests": "requests", "Tokens": "tokens", "Cost": "cost" };
                      const key = keyMap[value];
                      const isVisible = trendVisible[key];
                      if (!isVisible) {
                        return <span style={{ color: darkMode ? "#94a3b8" : "#cbd5e1", textDecoration: "line-through" }}>{value}</span>;
                      }
                      const colors: Record<string, string> = { "Requests": darkMode ? "#60a5fa" : "#3b82f6", "Tokens": darkMode ? "#4ade80" : "#16a34a", "Cost": "#fbbf24" };
                      return <span style={{ color: colors[value] || "inherit", fontWeight: 500 }}>{value}</span>;
                    }}
                    itemSorter={(item: any) => ({ requests: 0, tokens: 1, cost: 2 } as Record<string, number>)[item?.dataKey] ?? 999}
                  />
                  <Line hide={!trendVisible.requests} yAxisId={trendConfig.lineAxisMap.requests} type="monotone" dataKey="requests" stroke={darkMode ? "#60a5fa" : "#3b82f6"} strokeWidth={2} name="Requests" dot={{ r: 3, fill: darkMode ? "#60a5fa" : "#3b82f6", stroke: "#fff", strokeWidth: 1, fillOpacity: 0.2 }} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} />
                  <Line hide={!trendVisible.tokens} yAxisId={trendConfig.lineAxisMap.tokens} type="monotone" dataKey="tokens" stroke={darkMode ? "#4ade80" : "#16a34a"} strokeWidth={2} name="Tokens" dot={{ r: 3, fill: darkMode ? "#4ade80" : "#16a34a", stroke: "#fff", strokeWidth: 1, fillOpacity: 0.2 }} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} />
                  <Line hide={!trendVisible.cost} yAxisId={trendConfig.lineAxisMap.cost} type="monotone" dataKey="cost" stroke="#fbbf24" strokeWidth={2} name="Cost" dot={{ r: 3, fill: "#fbbf24", stroke: "#fff", strokeWidth: 1, fillOpacity: 0.2 }} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* Model usage pie chart */}
        {loadingOverview || !overviewData ? (
          <div className="lg:col-span-2">
            <Skeleton className="h-[400px] rounded-2xl" />
          </div>
        ) : (
          <div className={`animate-card-float rounded-2xl p-6 shadow-sm ring-1 lg:col-span-2 flex flex-col ${darkMode ? "bg-slate-800/50 ring-slate-700" : "bg-white ring-slate-200"}`} style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center justify-between">
              <h2 className={`text-lg font-semibold ${darkMode ? "text-white" : "text-slate-900"}`}>Model Usage Distribution</h2>
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1 rounded-lg border p-0.5 ${darkMode ? "border-slate-700 bg-slate-800" : "border-slate-300 bg-slate-100"}`}>
                  <button
                    onClick={() => setPieMode("tokens")}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition ${pieMode === "tokens" ? "bg-indigo-600 text-white" : darkMode ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    Token
                  </button>
                  <button
                    onClick={() => setPieMode("requests")}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition ${pieMode === "requests" ? "bg-indigo-600 text-white" : darkMode ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    Requests
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setFullscreenChart("pie")}
                  className={`rounded-lg p-1.5 transition ${darkMode ? "text-slate-400 hover:bg-slate-700 hover:text-white" : "text-slate-500 hover:bg-slate-200 hover:text-slate-900"}`}
                  title="View fullscreen"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-4 flex gap-4 h-[300px]">
              {showEmpty || overviewData.models.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-800/30 text-center">
                  <p className="text-base text-slate-400">No model data</p>
                </div>
              ) : (
              <>
                {/* Pie Chart */}
                <div
                  ref={pieChartContainerRef}
                  className="shrink-0 w-64"
                  onPointerLeave={() => {
                    cancelPieLegendClear();
                    setPieTooltipOpen(false);
                    setHoveredPieIndex(null);
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <Pie
                        data={overviewData.models}
                        dataKey={pieMode}
                        nameKey="model"
                        cx="50%"
                        cy="50%"
                        outerRadius="85%"
                        innerRadius="45%"
                        animationDuration={500}
                        onMouseEnter={(_, index) => {
                          setHoveredPieIndex(index);
                          setPieTooltipOpen(true);
                        }}
                        onMouseLeave={() => {
                          setHoveredPieIndex(null);
                          setPieTooltipOpen(false);
                        }}
                      >
                        {overviewData.models.map((_, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                            fillOpacity={hoveredPieIndex === null || hoveredPieIndex === index ? 1 : 0.3}
                            style={{ transition: 'fill-opacity 0.2s' }}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        position={{ x: 0, y: 0 }}
                        wrapperStyle={{ zIndex: 1000, pointerEvents: "none" }}
                        content={({ active, payload }) => {
                          if (!pieTooltipOpen || hoveredPieIndex === null) return null;
                          if (!active || !payload || !payload[0]) return null;
                          const data = payload[0].payload;
                          return (
                            <div
                              className="rounded-xl px-4 py-3 shadow-xl backdrop-blur-sm"
                              style={{ 
                                backgroundColor: darkMode ? "rgba(15, 23, 42, 0.7)" : "rgba(255, 255, 255, 0.8)", 
                                border: `1px solid ${darkMode ? "rgba(148, 163, 184, 0.4)" : "rgba(203, 213, 225, 0.6)"}`,
                                color: darkMode ? "#f8fafc" : "#0f172a"
                              }}
                            >
                              <p className={`mb-2 font-medium text-sm ${darkMode ? "text-slate-50" : "text-slate-900"}`}>{data.model}</p>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-blue-400 font-medium">Requests:</span>
                                  <span className={darkMode ? "text-slate-50" : "text-slate-700"}>{formatNumberWithCommas(data.requests)}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-emerald-400 font-medium">Tokens:</span>
                                  <span className={darkMode ? "text-slate-50" : "text-slate-700"}>{formatNumberWithCommas(data.tokens)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Custom legend */}
                <div className="flex-1 overflow-y-auto pr-2 space-y-1 custom-scrollbar">
                  {[...overviewData.models]
                    .sort((a, b) => b[pieMode] - a[pieMode])
                    .map((item, sortedIndex) => {
                      const originalIndex = overviewData.models.findIndex(m => m.model === item.model);
                      const total = overviewData.models.reduce((sum, m) => sum + m[pieMode], 0);
                      const percent = total > 0 ? (item[pieMode] / total) * 100 : 0;
                      const isHighlighted = hoveredPieIndex === null || hoveredPieIndex === originalIndex;
                      return (
                        <div 
                          key={item.model} 
                          className={`rounded-lg p-2 transition cursor-pointer ${
                            isHighlighted 
                              ? darkMode ? "bg-slate-700/30" : "bg-slate-100" 
                              : "opacity-40"
                          } ${darkMode ? "hover:bg-slate-700/50" : "hover:bg-slate-200"}`}
                          onMouseEnter={() => {
                            cancelPieLegendClear();
                            setHoveredPieIndex(originalIndex);
                          }}
                          onMouseLeave={() => {
                            schedulePieLegendClear();
                          }}
                          style={{ transition: 'all 0.2s' }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div 
                              className={`w-3 h-3 rounded-full shrink-0 transition-all duration-200 ${
                                isHighlighted && hoveredPieIndex === originalIndex ? 'ring-2 ring-offset-1' : ''
                              }`}
                              style={{ 
                                backgroundColor: PIE_COLORS[originalIndex % PIE_COLORS.length],
                                '--tw-ring-color': isHighlighted && hoveredPieIndex === originalIndex ? PIE_COLORS[originalIndex % PIE_COLORS.length] : 'transparent',
                                transform: isHighlighted && hoveredPieIndex === originalIndex ? 'scale(1.2)' : 'scale(1)'
                              } as React.CSSProperties} 
                            />
                            <p className={`text-sm font-medium truncate flex-1 ${darkMode ? "text-slate-200" : "text-slate-800"}`} title={item.model}>
                              {item.model}
                            </p>
                        </div>
                        <div className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"} ml-5`}>
                          <span className="font-semibold">{percent.toFixed(1)}%</span>
                          <span className="mx-1.5">·</span>
                          <span>{pieMode === "tokens" ? formatCompactNumber(item.tokens) : formatNumberWithCommas(item.requests)} {pieMode === "tokens" ? "tokens" : "times"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            </div>
          </div>
        )}
      </section>

      {/* Second row: hourly load + model costs */}
      <section className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Load Distribution */}
        {loadingOverview || !overviewData ? (
          <div className="lg:col-span-3">
            <Skeleton className="h-[400px] rounded-2xl" />
          </div>
        ) : (
          <div className={`animate-card-float rounded-2xl p-6 shadow-sm ring-1 lg:col-span-3 flex flex-col ${darkMode ? "bg-slate-800/50 ring-slate-700" : "bg-white ring-slate-200"}`} style={{ animationDelay: '0.25s' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className={`text-lg font-semibold ${darkMode ? "text-white" : "text-slate-900"}`}>Load Distribution</h2>
                <span className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                  {isHourlyView ? "Hourly" : "Daily"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                  <Info className="h-3 w-3" />
                  Token Type Distribution
                </span>
                <button
                  type="button"
                  onClick={() => setFullscreenChart("stacked")}
                  className={`rounded-lg p-1.5 transition ${darkMode ? "text-slate-400 hover:bg-slate-700 hover:text-white" : "text-slate-500 hover:bg-slate-200 hover:text-slate-900"}`}
                  title="View fullscreen"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-4 flex-1 min-h-64">
              {showEmpty ? (
                <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-800/30 text-center">
                  <p className="text-base text-slate-400">No hourly data</p>
                  <p className="mt-1 text-sm text-slate-500">Please trigger /api/sync to sync data first</p>
                </div>
              ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={loadDistributionData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradInput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fca5a5" />
                      <stop offset="100%" stopColor="#f87171" />
                    </linearGradient>
                    <linearGradient id="gradOutput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#86efac" />
                      <stop offset="100%" stopColor="#4ade80" />
                    </linearGradient>
                    <linearGradient id="gradReasoning" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fcd34d" />
                      <stop offset="100%" stopColor="#fbbf24" />
                    </linearGradient>
                    <linearGradient id="gradCached" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d8b4fe" />
                      <stop offset="100%" stopColor="#c084fc" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#334155" : "#e2e8f0"} />
                  <XAxis dataKey="label" stroke={darkMode ? "#94a3b8" : "#64748b"} fontSize={12} tickFormatter={isHourlyView ? formatLabel : undefined} />
                  <YAxis yAxisId="left" stroke={darkMode ? "#60a5fa" : "#3b82f6"} tickFormatter={(v) => formatCompactNumber(v)} fontSize={12} />
                  <YAxis yAxisId="right" orientation="right" stroke={darkMode ? "#94a3b8" : "#64748b"} tickFormatter={(v) => formatCompactNumber(v)} fontSize={12} />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const sortedPayload = [...payload].sort((a: any, b: any) => {
                        const order: Record<string, number> = { requests: 0, inputTokens: 1, outputTokens: 2, reasoningTokens: 3, cachedTokens: 4 };
                        return (order[a.dataKey] ?? 999) - (order[b.dataKey] ?? 999);
                      });
                      return (
                        <div 
                          className="rounded-xl px-4 py-3 shadow-xl backdrop-blur-sm"
                          style={{ 
                            backgroundColor: darkMode ? "rgba(15, 23, 42, 0.7)" : "rgba(255, 255, 255, 0.8)", 
                            border: `1px solid ${darkMode ? "rgba(148, 163, 184, 0.4)" : "rgba(203, 213, 225, 0.6)"}`,
                            color: darkMode ? "#f8fafc" : "#0f172a"
                          }}
                        >
                          <p className={`mb-2 font-medium text-sm ${darkMode ? "text-slate-50" : "text-slate-900"}`}>{label ? (isHourlyView ? formatLabel(String(label)) : String(label)) : ''}</p>
                          <div className="space-y-1">
                            {sortedPayload.map((entry: any, index: number) => {
                              let color = entry.color;
                              if (entry.name === "Input") color = darkMode ? "#fb7185" : "#e11d48";
                              if (entry.name === "Output") color = darkMode ? "#4ade80" : "#16a34a";
                              if (entry.name === "Reasoning") color = darkMode ? "#fbbf24" : "#d97706";
                              if (entry.name === "Cached") color = darkMode ? "#c084fc" : "#9333ea";
                              if (entry.name === "Requests") color = darkMode ? "#60a5fa" : "#3b82f6";
                              
                              return (
                                <div key={index} className="flex items-center gap-2 text-sm">
                                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                                  <span style={{ color: color }} className="font-medium">
                                    {entry.name}:
                                  </span>
                                  <span className={darkMode ? "text-slate-50" : "text-slate-700"}>
                                    {formatNumberWithCommas(entry.value)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <TrendLegend 
                    wrapperStyle={{ cursor: "pointer" }} 
                    onClick={handleHourlyLegendClick}
                    formatter={(value: string) => {
                      const keyMap: Record<string, string> = {
                        "Requests": "requests",
                        "Input": "inputTokens",
                        "Output": "outputTokens",
                        "Reasoning": "reasoningTokens",
                        "Cached": "cachedTokens"
                      };
                      const key = keyMap[value];
                      const isVisible = hourlyVisible[key];
                      
                      if (!isVisible) {
                        return <span style={{ color: darkMode ? "#94a3b8" : "#cbd5e1", textDecoration: "line-through" }}>{value}</span>;
                      }

                      const colors: Record<string, string> = {
                        "Requests": darkMode ? "#60a5fa" : "#3b82f6",
                        "Input": darkMode ? "#fb7185" : "#e11d48",
                        "Output": darkMode ? "#4ade80" : "#16a34a",
                        "Reasoning": darkMode ? "#fbbf24" : "#d97706",
                        "Cached": darkMode ? "#c084fc" : "#9333ea"
                      };
                      return <span style={{ color: colors[value] || "inherit", fontWeight: 500 }} title="Hold Ctrl and click to show only this item">{value}</span>;
                    }}
                    itemSorter={(item: any) => ({ requests: 0, inputTokens: 1, outputTokens: 2, reasoningTokens: 3, cachedTokens: 4 } as Record<string, number>)[item?.dataKey] ?? 999}
                    payload={[
                      { value: "Requests", type: "line", id: "requests", color: "#3b82f6", dataKey: "requests" },
                      { value: "Input", type: "square", id: "inputTokens", color: "#e11d48", dataKey: "inputTokens" },
                      { value: "Output", type: "square", id: "outputTokens", color: "#16a34a", dataKey: "outputTokens" },
                      { value: "Reasoning", type: "square", id: "reasoningTokens", color: "#d97706", dataKey: "reasoningTokens" },
                      { value: "Cached", type: "square", id: "cachedTokens", color: "#9333ea", dataKey: "cachedTokens" },
                    ]}
                  />
                  {/* Stacked bar chart - soft colors, top rounded corners, enhanced animation */}
                  <Bar hide={!hourlyVisible.inputTokens} yAxisId="right" dataKey="inputTokens" name="Input" stackId="tokens" fill="url(#gradInput)" fillOpacity={0.8} animationDuration={600} barSize={24} />
                  <Bar hide={!hourlyVisible.outputTokens} yAxisId="right" dataKey="outputTokens" name="Output" stackId="tokens" fill="url(#gradOutput)" fillOpacity={0.8} animationDuration={600} barSize={24} />
                  <Bar hide={!hourlyVisible.reasoningTokens} yAxisId="right" dataKey="reasoningTokens" name="Reasoning" stackId="tokens" fill="url(#gradReasoning)" fillOpacity={0.8} animationDuration={600} barSize={24} />
                  <Bar hide={!hourlyVisible.cachedTokens} yAxisId="right" dataKey="cachedTokens" name="Cached" stackId="tokens" fill="url(#gradCached)" fillOpacity={0.8} radius={[4, 4, 0, 0]} animationDuration={600} barSize={24} />
                  {/* Line on top layer - with stroke highlight */}
                  <Line 
                    hide={!hourlyVisible.requests}
                    yAxisId="left" 
                    type="monotone" 
                    dataKey="requests" 
                    name="Requests" 
                    stroke={darkMode ? "#60a5fa" : "#3b82f6"} 
                    strokeWidth={3}
                    dot={{ r: 3, fill: darkMode ? "#60a5fa" : "#3b82f6", stroke: "#fff", strokeWidth: 1, fillOpacity: 0.2 }} 
                    activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} 
                  />
                </ComposedChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* Model costs */}
        {loadingOverview || !overviewData ? (
          <div className="lg:col-span-2">
            <Skeleton className="h-[400px] rounded-2xl" />
          </div>
        ) : (
          <div className={`animate-card-float rounded-2xl p-6 shadow-sm ring-1 lg:col-span-2 ${darkMode ? "bg-slate-800/50 ring-slate-700" : "bg-white ring-slate-200"}`} style={{ animationDelay: '0.3s' }}>
            <div className="flex items-center justify-between">
              <h2 className={`text-lg font-semibold ${darkMode ? "text-white" : "text-slate-900"}`}>Estimated Model Costs</h2>
              <span className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Based on configured prices</span>
            </div>
            <div className="scrollbar-slim mt-3 max-h-80 min-h-[14rem] space-y-2 overflow-y-auto">
              {showEmpty ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-800/30 py-6 text-center">
                  <p className="text-base text-slate-400">No model data</p>
                </div>
              ) : sortedModelsByCost.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-800/30 py-6 text-center">
                <p className="text-base text-slate-400">No matching models</p>
              </div>
            ) : (
              sortedModelsByCost.map((model) => (
                <div
                  key={model.model}
                  className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${darkMode ? "border-slate-700 bg-slate-800/80" : "border-slate-200 bg-white"}`}
                >
                  <div>
                    <p className={`text-sm font-semibold ${darkMode ? "text-white" : "text-slate-900"}`}>{model.model}</p>
                    <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                      {formatNumberWithCommas(model.requests)} Requests • {formatCompactNumber(model.tokens)} tokens
                    </p>
                  </div>
                  <div className={`text-base font-semibold ${darkMode ? "text-emerald-400" : "text-emerald-600"}`}>{formatCurrency(model.cost)}</div>
                </div>
              ))
              )}
            </div>
          </div>
        )}
      </section>

      {/* Third row: Token by Route chart + Top 10 API Keys */}
      <section className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Token Usage by API Route — stacked bar chart over time */}
        {loadingOverview || !overviewData ? (
          <div className="lg:col-span-3">
            <div className={`h-[400px] animate-pulse rounded-2xl ${darkMode ? "bg-slate-800/50" : "bg-slate-200"}`} />
          </div>
        ) : (
          <div className={`animate-card-float flex flex-col rounded-2xl p-6 shadow-sm ring-1 lg:col-span-3 ${darkMode ? "bg-slate-800/50 ring-slate-700" : "bg-white ring-slate-200"}`} style={{ animationDelay: '0.32s' }}>
            <h2 className={`mb-3 text-lg font-semibold ${darkMode ? "text-white" : "text-slate-900"}`}>Token Usage by API Route</h2>
            <div className="min-h-[14rem] flex-1" style={{ height: 320 }}>
              <TokenByRouteChart
                data={tokenByRouteData}
                routes={tokenByRouteNames}
                darkMode={darkMode}
                isHourly={isHourlyView}
                formatLabel={formatLabel}
              />
            </div>
          </div>
        )}

        {/* Top 10 API Keys */}
        {loadingOverview || !overviewData ? (
          <div className="lg:col-span-2">
            <div className={`h-[400px] animate-pulse rounded-2xl ${darkMode ? "bg-slate-800/50" : "bg-slate-200"}`} />
          </div>
        ) : (
          <div className={`animate-card-float rounded-2xl p-6 shadow-sm ring-1 lg:col-span-2 ${darkMode ? "bg-slate-800/50 ring-slate-700" : "bg-white ring-slate-200"}`} style={{ animationDelay: '0.35s' }}>
            <div className="flex items-center justify-between">
              <h2 className={`text-lg font-semibold ${darkMode ? "text-white" : "text-slate-900"}`}>Top 10 API Keys</h2>
              <div className={`flex items-center gap-1 rounded-lg border p-0.5 ${darkMode ? "border-slate-700 bg-slate-800" : "border-slate-300 bg-slate-100"}`}>
                <button
                  onClick={() => setRoutesSortMode("tokens")}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition ${routesSortMode === "tokens" ? "bg-indigo-600 text-white" : darkMode ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900"}`}
                >
                  Token
                </button>
                <button
                  onClick={() => setRoutesSortMode("cost")}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition ${routesSortMode === "cost" ? "bg-indigo-600 text-white" : darkMode ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-900"}`}
                >
                  Cost
                </button>
              </div>
            </div>
            <div className="scrollbar-slim mt-3 max-h-80 min-h-[14rem] space-y-2 overflow-y-auto">
              {showEmpty || !sortedTopRoutes.length ? (
                <div className={`flex items-center justify-center rounded-xl border border-dashed py-6 ${darkMode ? "border-slate-700 bg-slate-800/30" : "border-slate-300 bg-slate-50"}`}>
                  <p className={`text-base ${darkMode ? "text-slate-400" : "text-slate-500"}`}>No route data</p>
                </div>
              ) : (
                sortedTopRoutes.map((route, index) => (
                  <div
                    key={route.route}
                    className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${darkMode ? "border-slate-700 bg-slate-800/80" : "border-slate-200 bg-white"}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${darkMode ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600"}`}>
                        {index + 1}
                      </span>
                      <div>
                        <p className={`max-w-[180px] truncate text-sm font-semibold ${darkMode ? "text-white" : "text-slate-900"}`} title={route.route}>
                          {route.route}
                        </p>
                        <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                          {formatNumberWithCommas(route.requests)} Requests • {formatCompactNumber(route.tokens)} tokens
                        </p>
                      </div>
                    </div>
                    <div className={`text-base font-semibold ${darkMode ? "text-emerald-400" : "text-emerald-600"}`}>
                      {formatCurrency(route.cost)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </section>

      {/* Fullscreen chart modal */}
      <Modal
        isOpen={!!fullscreenChart}
        onClose={() => setFullscreenChart(null)}
        title={
          fullscreenChart === "stacked" || fullscreenChart === "pie" ? undefined :
          fullscreenChart === "trend" ? `${isHourlyView ? "Hourly" : "Daily"} Requests & Token Trend` :
          ""
        }
        darkMode={darkMode}
        className="max-w-6xl"
        backdropClassName="bg-black/70"
      >
        <div className="mt-4 h-[70vh]">
          {fullscreenChart === "trend" && overviewData && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#334155" strokeDasharray="5 5" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={12} tickFormatter={isHourlyView ? formatLabel : undefined} />
                <YAxis 
                  yAxisId="left" 
                  stroke={trendConfig.leftAxis.color} 
                  tickFormatter={trendConfig.leftAxis.formatter} 
                  fontSize={12} 
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke={trendConfig.rightAxis.color}
                  tickFormatter={trendConfig.rightAxis.formatter}
                  fontSize={12}
                  hide={!trendConfig.rightAxisVisible}
                />
                <YAxis
                  yAxisId="cost"
                  orientation="right"
                  stroke="#fbbf24"
                  tickFormatter={(v) => formatCurrency(v)}
                  fontSize={12}
                  hide={!trendVisible.cost || (trendVisible.requests && trendVisible.tokens)}
                  width={trendVisible.cost && (!trendVisible.requests || !trendVisible.tokens) ? undefined : 0}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const sortedPayload = [...payload].sort((a: any, b: any) => {
                      const order: Record<string, number> = { requests: 0, tokens: 1, cost: 2 };
                      return (order[a.dataKey] ?? 999) - (order[b.dataKey] ?? 999);
                    });
                    return (
                      <div 
                        className="rounded-xl px-4 py-3 shadow-xl backdrop-blur-sm"
                        style={{ 
                          backgroundColor: darkMode ? "rgba(15, 23, 42, 0.7)" : "rgba(255, 255, 255, 0.8)", 
                          border: `1px solid ${darkMode ? "rgba(148, 163, 184, 0.4)" : "rgba(203, 213, 225, 0.6)"}`,
                          color: darkMode ? "#f8fafc" : "#0f172a"
                        }}
                      >
                        <p className={`mb-2 font-medium text-sm ${darkMode ? "text-slate-50" : "text-slate-900"}`}>{label}</p>
                        <div className="space-y-1">
                          {sortedPayload.map((entry: any, index: number) => {
                            let color = entry.color;
                            if (entry.name === "Requests") color = darkMode ? "#60a5fa" : "#3b82f6";
                            if (entry.name === "Tokens") color = darkMode ? "#4ade80" : "#16a34a";
                            if (entry.name === "Cost") color = "#fbbf24";
                            
                            const value = entry.name === "Cost" ? formatCurrency(entry.value) : formatNumberWithCommas(entry.value);
                            
                            return (
                              <div key={index} className="flex items-center gap-2 text-sm">
                                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                                <span style={{ color: color }} className="font-medium">
                                  {entry.name}:
                                </span>
                                <span className={darkMode ? "text-slate-50" : "text-slate-700"}>
                                  {value}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }}
                />
                <TrendLegend 
                  height={24} 
                  iconSize={10} 
                  wrapperStyle={{ paddingTop: 0, paddingBottom: 0, lineHeight: "24px", cursor: "pointer" }} 
                  onClick={handleTrendLegendClick}
                  formatter={(value: string) => {
                    const keyMap: Record<string, string> = { "Requests": "requests", "Tokens": "tokens", "Cost": "cost" };
                    const key = keyMap[value];
                    const isVisible = trendVisible[key];
                    if (!isVisible) {
                      return <span style={{ color: darkMode ? "#94a3b8" : "#cbd5e1", textDecoration: "line-through" }}>{value}</span>;
                    }
                    const colors: Record<string, string> = { "Requests": darkMode ? "#60a5fa" : "#3b82f6", "Tokens": darkMode ? "#4ade80" : "#16a34a", "Cost": "#fbbf24" };
                    return <span style={{ color: colors[value] || "inherit", fontWeight: 500 }}>{value}</span>;
                  }}
                  itemSorter={(item: any) => ({ requests: 0, tokens: 1, cost: 2 } as Record<string, number>)[item?.dataKey] ?? 999}
                />
                <Line hide={!trendVisible.requests} yAxisId={trendConfig.lineAxisMap.requests} type="monotone" dataKey="requests" stroke={darkMode ? "#60a5fa" : "#3b82f6"} strokeWidth={2} name="Requests" dot={{ r: 3, fill: darkMode ? "#60a5fa" : "#3b82f6", stroke: "#fff", strokeWidth: 1, fillOpacity: 0.2 }} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} />
                <Line hide={!trendVisible.tokens} yAxisId={trendConfig.lineAxisMap.tokens} type="monotone" dataKey="tokens" stroke={darkMode ? "#4ade80" : "#16a34a"} strokeWidth={2} name="Tokens" dot={{ r: 3, fill: darkMode ? "#4ade80" : "#16a34a", stroke: "#fff", strokeWidth: 1, fillOpacity: 0.2 }} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} />
                <Line hide={!trendVisible.cost} yAxisId={trendConfig.lineAxisMap.cost} type="monotone" dataKey="cost" stroke="#fbbf24" strokeWidth={2} name="Cost" dot={{ r: 3, fill: "#fbbf24", stroke: "#fff", strokeWidth: 1, fillOpacity: 0.2 }} activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
          {fullscreenChart === "pie" && overviewData && overviewData.models.length > 0 && (
            <div className="flex h-full flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-white">Model Usage Distribution</h3>
                <div className="flex items-center gap-1 pr-5">
                  <button
                    type="button"
                    onClick={() => setPieMode("tokens")}
                    className={`rounded-md border px-2 py-1 text-xs transition ${
                      pieMode === "tokens"
                        ? "border-indigo-500 bg-indigo-600 text-white"
                        : darkMode ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    Token
                  </button>
                  <button
                    type="button"
                    onClick={() => setPieMode("requests")}
                    className={`rounded-md border px-2 py-1 text-xs transition ${
                      pieMode === "requests"
                        ? "border-indigo-500 bg-indigo-600 text-white"
                        : darkMode ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    Requests
                  </button>
                </div>
              </div>
              <div className="flex gap-6 flex-1">
                {/* Pie Chart */}
                <div
                  ref={pieChartFullscreenContainerRef}
                  className="flex-1"
                  onPointerLeave={() => {
                    cancelPieLegendClear();
                    setPieTooltipOpen(false);
                    setHoveredPieIndex(null);
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <Pie
                        data={overviewData.models}
                        dataKey={pieMode}
                        nameKey="model"
                        cx="50%"
                        cy="50%"
                        outerRadius="75%"
                        innerRadius="40%"
                        animationDuration={500}
                        onMouseEnter={(_, index) => {
                          setHoveredPieIndex(index);
                          setPieTooltipOpen(true);
                        }}
                        onMouseLeave={() => {
                          setHoveredPieIndex(null);
                          setPieTooltipOpen(false);
                        }}
                      >
                        {overviewData.models.map((_, index) => (
                          <Cell 
                            key={`cell-fs-${index}`} 
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                            fillOpacity={hoveredPieIndex === null || hoveredPieIndex === index ? 1 : 0.3}
                            style={{ transition: 'fill-opacity 0.2s' }}
                          />
                        ))}
                      </Pie>
                      <Tooltip 
                        position={{ x: 0, y: 0 }}
                        wrapperStyle={{ zIndex: 1000, pointerEvents: "none" }}
                        content={({ active, payload }) => {
                          if (!pieTooltipOpen || hoveredPieIndex === null) return null;
                          if (!active || !payload || !payload[0]) return null;
                          const data = payload[0].payload;
                          return (
                            <div
                              className="rounded-xl px-4 py-3 shadow-xl backdrop-blur-sm"
                              style={{ 
                                backgroundColor: darkMode ? "rgba(15, 23, 42, 0.7)" : "rgba(255, 255, 255, 0.8)", 
                                border: `1px solid ${darkMode ? "rgba(148, 163, 184, 0.4)" : "rgba(203, 213, 225, 0.6)"}`,
                                color: darkMode ? "#f8fafc" : "#0f172a"
                              }}
                            >
                              <p className={`mb-2 font-medium text-sm ${darkMode ? "text-slate-50" : "text-slate-900"}`}>{data.model}</p>
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-blue-400 font-medium">Requests:</span>
                                  <span className={darkMode ? "text-slate-50" : "text-slate-700"}>{formatNumberWithCommas(data.requests)}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="text-emerald-400 font-medium">Tokens:</span>
                                  <span className={darkMode ? "text-slate-50" : "text-slate-700"}>{formatNumberWithCommas(data.tokens)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Custom legend */}
                <div className="w-80 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                  {[...overviewData.models]
                    .sort((a, b) => b[pieMode] - a[pieMode])
                    .map((item) => {
                      const originalIndex = overviewData.models.findIndex(m => m.model === item.model);
                      const total = overviewData.models.reduce((sum, m) => sum + m[pieMode], 0);
                      const percent = total > 0 ? (item[pieMode] / total) * 100 : 0;
                      const isHighlighted = hoveredPieIndex === null || hoveredPieIndex === originalIndex;
                      return (
                        <div 
                          key={item.model} 
                          className={`rounded-lg p-3 transition cursor-pointer ${
                            isHighlighted 
                              ? darkMode ? "bg-slate-700/30" : "bg-slate-100" 
                              : "opacity-40"
                          } ${darkMode ? "hover:bg-slate-700/50" : "hover:bg-slate-200"}`}
                          onMouseEnter={() => {
                            cancelPieLegendClear();
                            setHoveredPieIndex(originalIndex);
                          }}
                          onMouseLeave={() => {
                            schedulePieLegendClear();
                          }}
                          style={{ transition: 'all 0.2s' }}
                        >
                          <div className="flex items-center gap-2 mb-1.5">
                            <div 
                              className={`w-4 h-4 rounded-full shrink-0 transition-all duration-200 ${
                                isHighlighted && hoveredPieIndex === originalIndex ? 'ring-2 ring-offset-1' : ''
                              }`}
                              style={{ 
                                backgroundColor: PIE_COLORS[originalIndex % PIE_COLORS.length],
                                '--tw-ring-color': isHighlighted && hoveredPieIndex === originalIndex ? PIE_COLORS[originalIndex % PIE_COLORS.length] : 'transparent',
                                transform: isHighlighted && hoveredPieIndex === originalIndex ? 'scale(1.2)' : 'scale(1)'
                              } as React.CSSProperties}
                            />
                            <p className={`text-base font-medium truncate flex-1 ${darkMode ? "text-slate-200" : "text-slate-800"}`} title={item.model}>
                              {item.model}
                            </p>
                          </div>
                          <div className={`text-sm ${darkMode ? "text-slate-400" : "text-slate-600"} ml-6`}>
                            <span className="font-semibold">{percent.toFixed(1)}%</span>
                            <span className="mx-1.5">·</span>
                            <span>{pieMode === "tokens" ? formatCompactNumber(item.tokens) : formatNumberWithCommas(item.requests)} {pieMode === "tokens" ? "tokens" : "times"}</span>
                          </div>
                        </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {fullscreenChart === "stacked" && overviewData && (
            <div className="flex h-full flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-white">Load Distribution</h3>
                  <span className="text-xs text-slate-400">
                    {isHourlyView ? "Hourly" : "Daily"}
                  </span>
                </div>
                <div className="flex items-center gap-1 pr-5">
                  <button
                    type="button"
                    onClick={() => setFullscreenHourlyMode("area")}
                    className={`rounded-md border px-2 py-1 text-xs transition ${
                      fullscreenHourlyMode === "area"
                        ? "border-indigo-500 bg-indigo-600 text-white"
                        : darkMode ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    Stacked Area Chart
                  </button>
                  <button
                    type="button"
                    onClick={() => setFullscreenHourlyMode("bar")}
                    className={`rounded-md border px-2 py-1 text-xs transition ${
                      fullscreenHourlyMode === "bar"
                        ? "border-indigo-500 bg-indigo-600 text-white"
                        : darkMode ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                    }`}
                  >
                    Stacked Bar Chart
                  </button>
                </div>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={loadDistributionData} margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradInputFS" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fca5a5" />
                      <stop offset="100%" stopColor="#f87171" />
                    </linearGradient>
                    <linearGradient id="gradOutputFS" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#86efac" />
                      <stop offset="100%" stopColor="#4ade80" />
                    </linearGradient>
                    <linearGradient id="gradReasoningFS" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fcd34d" />
                      <stop offset="100%" stopColor="#fbbf24" />
                    </linearGradient>
                    <linearGradient id="gradCachedFS" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d8b4fe" />
                      <stop offset="100%" stopColor="#c084fc" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#334155" : "#e2e8f0"} />
                  <XAxis dataKey="label" stroke={darkMode ? "#94a3b8" : "#64748b"} fontSize={12} tickFormatter={isHourlyView ? formatLabel : undefined} />
                  <YAxis yAxisId="left" stroke={darkMode ? "#60a5fa" : "#3b82f6"} tickFormatter={(v) => formatCompactNumber(v)} fontSize={12} />
                  <YAxis yAxisId="right" orientation="right" stroke={darkMode ? "#94a3b8" : "#64748b"} tickFormatter={(v) => formatCompactNumber(v)} fontSize={12} />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const sortedPayload = [...payload].sort((a: any, b: any) => {
                        const order: Record<string, number> = { requests: 0, inputTokens: 1, outputTokens: 2, reasoningTokens: 3, cachedTokens: 4 };
                        return (order[a.dataKey] ?? 999) - (order[b.dataKey] ?? 999);
                      });
                      return (
                        <div 
                          className="rounded-xl px-4 py-3 shadow-xl backdrop-blur-sm"
                          style={{ 
                            backgroundColor: darkMode ? "rgba(15, 23, 42, 0.7)" : "rgba(255, 255, 255, 0.8)", 
                            border: `1px solid ${darkMode ? "rgba(148, 163, 184, 0.4)" : "rgba(203, 213, 225, 0.6)"}`,
                            color: darkMode ? "#f8fafc" : "#0f172a"
                          }}
                        >
                          <p className={`mb-2 font-medium text-sm ${darkMode ? "text-slate-50" : "text-slate-900"}`}>{label ? (isHourlyView ? formatLabel(String(label)) : String(label)) : ''}</p>
                          <div className="space-y-1">
                            {sortedPayload.map((entry: any, index: number) => {
                              let color = entry.color;
                              if (entry.name === "Input") color = darkMode ? "#fb7185" : "#e11d48";
                              if (entry.name === "Output") color = darkMode ? "#4ade80" : "#16a34a";
                              if (entry.name === "Reasoning") color = darkMode ? "#fbbf24" : "#d97706";
                              if (entry.name === "Cached") color = darkMode ? "#c084fc" : "#9333ea";
                              if (entry.name === "Requests") color = darkMode ? "#60a5fa" : "#3b82f6";
                              
                              return (
                                <div key={index} className="flex items-center gap-2 text-sm">
                                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                                  <span style={{ color: color }} className="font-medium">
                                    {entry.name}:
                                  </span>
                                  <span className={darkMode ? "text-slate-50" : "text-slate-700"}>
                                    {formatNumberWithCommas(entry.value)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <TrendLegend 
                    wrapperStyle={{ cursor: "pointer" }} 
                    onClick={handleHourlyLegendClick}
                    formatter={(value: string) => {
                      const keyMap: Record<string, string> = {
                        "Requests": "requests",
                        "Input": "inputTokens",
                        "Output": "outputTokens",
                        "Reasoning": "reasoningTokens",
                        "Cached": "cachedTokens"
                      };
                      const key = keyMap[value];
                      const isVisible = hourlyVisible[key];
                      
                      if (!isVisible) {
                        return <span style={{ color: darkMode ? "#94a3b8" : "#cbd5e1", textDecoration: "line-through" }}>{value}</span>;
                      }

                      const colors: Record<string, string> = {
                        "Requests": darkMode ? "#60a5fa" : "#3b82f6",
                        "Input": darkMode ? "#fb7185" : "#e11d48",
                        "Output": darkMode ? "#4ade80" : "#16a34a",
                        "Reasoning": darkMode ? "#fbbf24" : "#d97706",
                        "Cached": darkMode ? "#c084fc" : "#9333ea"
                      };
                      return <span style={{ color: colors[value] || "inherit", fontWeight: 500 }} title="Hold Ctrl and click to show only this item">{value}</span>;
                    }}
                    itemSorter={(item: any) => ({ requests: 0, inputTokens: 1, outputTokens: 2, reasoningTokens: 3, cachedTokens: 4 } as Record<string, number>)[item?.dataKey] ?? 999}
                    payload={[
                      { value: "Requests", type: "line", id: "requests", color: "#3b82f6", dataKey: "requests" },
                      { value: "Input", type: "square", id: "inputTokens", color: "#e11d48", dataKey: "inputTokens" },
                      { value: "Output", type: "square", id: "outputTokens", color: "#16a34a", dataKey: "outputTokens" },
                      { value: "Reasoning", type: "square", id: "reasoningTokens", color: "#d97706", dataKey: "reasoningTokens" },
                      { value: "Cached", type: "square", id: "cachedTokens", color: "#9333ea", dataKey: "cachedTokens" },
                    ]}
                  />
                  {/* Stacked layers: supports bar and area switching */}
                  {fullscreenHourlyMode === "area" ? (
                    <>
                      <Area hide={!hourlyVisible.inputTokens} yAxisId="right" dataKey="inputTokens" name="Input" stackId="tokens" type="monotone" stroke="#fca5a5" fill="url(#gradInputFS)" fillOpacity={0.35} animationDuration={600} />
                      <Area hide={!hourlyVisible.outputTokens} yAxisId="right" dataKey="outputTokens" name="Output" stackId="tokens" type="monotone" stroke="#4ade80" fill="url(#gradOutputFS)" fillOpacity={0.35} animationDuration={600} />
                      <Area hide={!hourlyVisible.reasoningTokens} yAxisId="right" dataKey="reasoningTokens" name="Reasoning" stackId="tokens" type="monotone" stroke="#fbbf24" fill="url(#gradReasoningFS)" fillOpacity={0.35} animationDuration={600} />
                      <Area hide={!hourlyVisible.cachedTokens} yAxisId="right" dataKey="cachedTokens" name="Cached" stackId="tokens" type="monotone" stroke="#c084fc" fill="url(#gradCachedFS)" fillOpacity={0.35} animationDuration={600} />
                    </>
                  ) : (
                    <>
                      <Bar hide={!hourlyVisible.inputTokens} yAxisId="right" dataKey="inputTokens" name="Input" stackId="tokens" fill="url(#gradInputFS)" fillOpacity={0.8} animationDuration={600} barSize={32} />
                      <Bar hide={!hourlyVisible.outputTokens} yAxisId="right" dataKey="outputTokens" name="Output" stackId="tokens" fill="url(#gradOutputFS)" fillOpacity={0.8} animationDuration={600} barSize={32} />
                      <Bar hide={!hourlyVisible.reasoningTokens} yAxisId="right" dataKey="reasoningTokens" name="Reasoning" stackId="tokens" fill="url(#gradReasoningFS)" fillOpacity={0.8} animationDuration={600} barSize={32} />
                      <Bar hide={!hourlyVisible.cachedTokens} yAxisId="right" dataKey="cachedTokens" name="Cached" stackId="tokens" fill="url(#gradCachedFS)" fillOpacity={0.8} animationDuration={600} barSize={32} />
                    </>
                  )}
                  {/* Line on top layer - with stroke highlight */}
                  <Line 
                    hide={!hourlyVisible.requests}
                    yAxisId="left" 
                    type="monotone" 
                    dataKey="requests" 
                    name="Requests" 
                    stroke={darkMode ? "#60a5fa" : "#3b82f6"} 
                    strokeWidth={fullscreenHourlyMode === "area" ? 2.3 : 3}
                    strokeOpacity={1}
                    dot={{ r: 3, fill: darkMode ? "#60a5fa" : "#3b82f6", stroke: "#fff", strokeWidth: 1, fillOpacity: 0.2 }} 
                    activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }} 
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Modal>

      {/* Toast notifications - top right display */}
      {syncStatus && (
        <div
          onClick={() => closeSyncStatus()}
          className={`fixed right-6 top-24 z-50 max-w-[290px] cursor-pointer rounded-lg border px-4 py-3 shadow-lg transition-opacity hover:opacity-90 ${
            syncStatusClosing ? "animate-toast-out" : "animate-toast-in"
          } ${
            syncStatus.includes("failed") || syncStatus.includes("timeout")
              ? darkMode
                ? "border-rose-500/30 bg-rose-950/60 text-rose-200"
                : "border-rose-300 bg-rose-50 text-rose-800"
              : darkMode
              ? "border-green-500/40 bg-green-900/80 text-green-100"
              : "border-green-400 bg-green-50 text-green-900"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-xl animate-emoji-pop">
              {syncStatus.includes("failed") || syncStatus.includes("timeout") ? "❌" : "✅"}
            </span>
            <span className="text-sm font-medium">{syncStatus}</span>
          </div>
        </div>
      )}

      {saveStatus && (
        <div
          onClick={() => closeSaveStatus()}
          className={`fixed right-6 top-24 z-50 max-w-[290px] cursor-pointer rounded-lg border px-4 py-3 shadow-lg transition-opacity hover:opacity-90 ${
            saveStatusClosing ? "animate-toast-out" : "animate-toast-in"
          } ${
            darkMode
              ? "border-green-500/40 bg-green-900/80 text-green-100"
              : "border-green-400 bg-green-50 text-green-900"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-xl animate-emoji-pop">✅</span>
            <span className="text-sm font-medium">{saveStatus}</span>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value, hint, subValue, icon: Icon }: { label: string; value: string; hint?: string; subValue?: string; icon?: LucideIcon }) {
  return (
    <div className="rounded-2xl bg-slate-800/50 p-5 shadow-sm ring-1 ring-slate-700 transition-all duration-200 hover:shadow-lg hover:shadow-slate-700/30 hover:ring-slate-600">
      <div className="flex items-center gap-2 text-sm uppercase tracking-wide text-slate-400">
        {Icon ? <Icon className="h-4 w-4" /> : null}
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
      {subValue ? <p className="mt-2 text-sm text-slate-300">{subValue}</p> : null}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function ComboBox({
  value,
  onChange,
  options,
  placeholder,
  darkMode,
  className,
  onSelectOption,
  onClear
}: {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  darkMode: boolean;
  className?: string;
  onSelectOption?: (val: string) => void;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [hasTyped, setHasTyped] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  const filtered = useMemo(() => {
    if (!hasTyped) return options;
    return options.filter((opt) => opt.toLowerCase().includes(value.toLowerCase()));
  }, [hasTyped, options, value]);

  const baseInput = `${className ?? ""} rounded-lg border px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none ${
    darkMode ? "border-slate-700 bg-slate-800 text-white placeholder-slate-500" : "border-slate-300 bg-white text-slate-900 placeholder-slate-400"
  }`;

  const closeDropdown = () => {
    setIsClosing(true);
    setTimeout(() => {
      setOpen(false);
      setIsVisible(false);
      setIsClosing(false);
    }, 100); // Match animation duration
  };

  useEffect(() => {
    if (open) {
      // Use requestAnimationFrame to ensure DOM is ready before starting animation
      requestAnimationFrame(() => {
        startTransition(() => {
          setIsVisible(true);
          setIsClosing(false);
        });
      });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          setHasTyped(true);
          onChange(e.target.value);
        }}
        onFocus={() => {
          setOpen(true);
          setHasTyped(false);
        }}
        placeholder={placeholder}
        className={`${baseInput} pr-8`}
      />
      {value && (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent input from focusing
          }}
          onClick={() => {
            onChange("");
            setHasTyped(false);
            onClear?.();
          }}
          className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 transition ${
            darkMode ? "text-slate-400 hover:bg-slate-700 hover:text-slate-200" : "text-slate-500 hover:bg-slate-200 hover:text-slate-700"
          }`}
          title="Clear"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {isVisible && filtered.length > 0 ? (
        <div
          className={`absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border shadow-lg scrollbar-slim ${
            darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
          } ${isClosing ? "animate-dropdown-out" : "animate-dropdown-in"}`}
        >
          {filtered.map((opt) => (
            <button
              type="button"
              key={opt}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt);
                setHasTyped(false);
                closeDropdown();
                inputRef.current?.blur();
                onSelectOption?.(opt);
              }}
              className={`block w-full px-3 py-2 text-left text-sm transition ${
                darkMode ? "text-slate-200 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-700/50 ${className ?? ""}`} />;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-800/50 text-base text-slate-400">
      {message}
    </div>
  );
}
