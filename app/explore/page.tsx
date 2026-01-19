"use client";

import { forwardRef, startTransition, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompactNumber, formatNumberWithCommas } from "@/lib/utils";

type ExplorePoint = {
  ts: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  model: string;
};

type ExploreResponse = {
  days: number;
  total: number;
  returned: number;
  step: number;
  points: ExplorePoint[];
  error?: string;
};

// High-contrast bright color palette - 20 colors with high saturation/brightness for strong differentiation
// Evenly distributed by hue, saturation 70-90%, brightness 55-75%, adapted for dark theme
// Optimized ordering: 1,3,5,7,9,2,4,6,8,10 pattern maximizes adjacent color contrast
const MODEL_COLORS = [
  "#ff7a7aff", // 14 Rose (345°)
  "#ffe863ff", // 3 Orange-yellow (40°)
  "#8df48dff", // 6 Green (120°)
  "#72afffff", // 9 Blue (220°)
  "#a582ff", // 11 Purple (270°)
  "#99e6ff", // 19 Light blue (200°+)
  "#ff76d1ff", // 13 Magenta (320°)
  "#ffb3b3", // 15 Light red (0°+)
  "#fff899", // 17 Light yellow (60°+)
  "#ff8c42", // 2 Orange-red (20°)
  "#ffe66d", // 4 Yellow (60°)
  "#42c9f5", // 8 Cyan (195°)
  "#7d7aff", // 10 Indigo (245°)
  "#d97aff", // 12 Magenta-purple (290°)
  "#ffd699", // 16 Light orange (40°+)
  "#b3f5b3", // 18 Light green (120°+)
  "#d9b3ff", // 20 Light purple (280°+)
];

const TOKEN_COLORS = {
  input: "#60a5fa",
  output: "#4ade80",
  reasoning: "#fbbf24",
  cached: "#c084fc"
} as const;

const CHART_MARGIN = { top: 8, right: 12, left: 8, bottom: 12 };
const CHART_TOP_INSET = 4;

function clamp(num: number, min: number, max: number) {
  return Math.min(Math.max(num, min), max);
}

// Add small padding to ensure edge points are fully visible
function niceDomain([min, max]: [number, number], paddingRatio = 0.01): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) return [min - 1, max + 1];
  const range = max - min;
  const padding = range * paddingRatio;
  return [min - padding, max + padding];
}

// Y-axis: add -1% padding at bottom, 2% padding at top
function niceYDomain([min, max]: [number, number], paddingRatio = 0.02): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) return [0, max + 1];
  const range = max - min;
  const topPadding = range * paddingRatio;
  const bottomPadding = range * 0.01; // Bottom -1%
  return [min - bottomPadding, max + topPadding];
}

// Fixed ticks to avoid grid recalculation every frame due to lerp animation
// Generate only ticks within actual domain range, display actual max value at top
function computeNiceTicks([min, max]: [number, number], maxTickCount = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || maxTickCount <= 0) return [];
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.1);
    return [min - pad, min, min + pad];
  }
  const range = max - min;
  const roughStep = range / Math.max(1, maxTickCount - 1);
  const power = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const candidates = [1, 2, 5, 10];
  let step = roughStep;
  for (const c of candidates) {
    const s = c * power;
    if (s >= roughStep) {
      step = s;
      break;
    }
  }
  const tickStart = Math.ceil(min / step) * step;
  const tickEnd = Math.floor(max / step) * step;
  const ticks: number[] = [];
  for (let v = tickStart; v <= tickEnd + step * 0.01 && ticks.length < 200; v += step) {
    ticks.push(Number(v.toFixed(6)));
  }
  // If last tick is significantly away from max, add actual max as top tick
  const lastTick = ticks[ticks.length - 1] ?? min;
  const gapToMax = max - lastTick;
  // When distance exceeds 15% of step, add max value tick
  if (gapToMax > step * 0.15) {
    ticks.push(Number(max.toFixed(6)));
  }
  return ticks;
}

// Time axis tick calculation: ensure start and end times are always included
function computeTimeTicks([min, max]: [number, number], maxTickCount = 8): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || maxTickCount <= 0) return [];
  if (min === max) return [min];

  const range = max - min;
  const roughStep = range / Math.max(1, maxTickCount - 1);

  // Time step candidates (milliseconds)
  const timeSteps = [
    1000,           // 1s
    2000,           // 2s
    5000,           // 5s
    10000,          // 10s
    30000,          // 30s
    60000,          // 1m
    120000,         // 2m
    300000,         // 5m
    600000,         // 10m
    900000,         // 15m
    1800000,        // 30m
    3600000,        // 1h
    7200000,        // 2h
    10800000,       // 3h
    21600000,       // 6h
    43200000,       // 12h
    86400000,       // 1d
    172800000,      // 2d
    432000000,      // 5d
    604800000,      // 7d
  ];

  // Select appropriate step size
  let step = timeSteps[timeSteps.length - 1];
  for (const s of timeSteps) {
    if (s >= roughStep) {
      step = s;
      break;
    }
  }
  
  // Generate intermediate ticks
  const ticks: number[] = [min]; // Always include start time
  const tickStart = Math.ceil(min / step) * step;
  const tickEnd = Math.floor(max / step) * step;

  for (let v = tickStart; v <= tickEnd && ticks.length < 200; v += step) {
    // Avoid being too close to start time (less than 5% of range)
    if (Math.abs(v - min) > range * 0.05 && Math.abs(v - max) > range * 0.05) {
      ticks.push(Number(v.toFixed(0)));
    }
  }

  // Always include end time
  ticks.push(max);
  
  return ticks;
}

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDateInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTs(ms: number) {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return "";
  return timeFormatter.format(d);
}

function useLerpYDomain(
  targetDomain: [number, number] | undefined,
  factor = 0.15,
  enabled = true
): [number, number] | undefined {
  const [currentDomain, setCurrentDomain] = useState(targetDomain);
  const targetRef = useRef(targetDomain);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const frameRef = useRef(0);

  // Sync domain when target changes or animation is disabled
  useEffect(() => {
    if (!targetDomain || !enabled) {
      startTransition(() => setCurrentDomain(targetDomain));
    }
  }, [targetDomain, enabled]);

  useEffect(() => {
    targetRef.current = targetDomain;
  }, [targetDomain]);

  useEffect(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }

    // Only proceed with animation if target exists and enabled
    if (!targetDomain || !enabled) {
      return;
    }

    // Single path: increase frame count for smoothness while limiting total duration to avoid sluggishness
    const stepFactor = factor;
    const maxFrames = 60;
    const maxDuration = 1000; // ms
    const snapThreshold = 1; // Token difference below threshold snaps directly

    startTimeRef.current = null;
    frameRef.current = 0;

    const animate = (timestamp: number) => {
      if (startTimeRef.current == null) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      let shouldContinue = true;

      setCurrentDomain(prev => {
        const target = targetRef.current;
        if (!target) {
          shouldContinue = false;
          return undefined;
        }
        if (!prev) {
          shouldContinue = false;
          return target;
        }

        const [currentMin, currentMax] = prev;
        const [targetMin, targetMax] = target;

        const diffMin = targetMin - currentMin;
        const diffMax = targetMax - currentMax;

        const snapMin = Math.abs(diffMin) <= snapThreshold;
        const snapMax = Math.abs(diffMax) <= snapThreshold;

        if (snapMin && snapMax) {
          shouldContinue = false;
          return target;
        }

        return [
          currentMin + diffMin * stepFactor,
          currentMax + diffMax * stepFactor
        ];
      });

      frameRef.current += 1;

      if (!shouldContinue || frameRef.current >= maxFrames || elapsed >= maxDuration) {
        setCurrentDomain(targetRef.current);
        return;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [enabled, factor, targetDomain]);

  return currentDomain;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-700/50 ${className ?? ""}`} />;
}

// Standalone legend component, using React.memo to avoid unnecessary re-renders
import { memo } from "react";

type ModelLegendProps = {
  models: string[];
  hiddenModels: Set<string>;
  getModelColor: (model: string) => string;
  onMouseEnter: (model: string) => void;
  onMouseLeave: () => void;
  onClick: (model: string) => void;
};

const ModelLegend = memo(function ModelLegend({
  models,
  hiddenModels,
  getModelColor,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: ModelLegendProps) {
  if (models.length === 0) return null;
  
  return (
    <div className="mt-3 rounded-xl bg-slate-900/30 p-3 ring-1 ring-slate-800">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
        <span className="text-slate-400">Model legend (hover to highlight, click to hide)</span>
      </div>
      <div className="mt-2 max-h-20 overflow-auto pr-1">
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-300">
          {models.map((m) => {
            const isHidden = hiddenModels.has(m);
            return (
              <button
                key={m}
                type="button"
                className={`flex items-center gap-2 rounded-md px-1.5 py-0.5 transition-all hover:bg-slate-600/40 ${isHidden ? 'opacity-40' : ''}`}
                onMouseEnter={() => onMouseEnter(m)}
                onMouseLeave={onMouseLeave}
                onClick={() => onClick(m)}
              >
                <span 
                  className={`h-2.5 w-2.5 rounded-full ${isHidden ? 'ring-1 ring-slate-500' : ''}`} 
                  style={{ backgroundColor: isHidden ? 'transparent' : getModelColor(m), opacity: isHidden ? 1 : 0.8 }} 
                />
                <span className={`max-w-[18rem] truncate ${isHidden ? 'line-through' : ''}`}>{m}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default function ExplorePage() {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Remove recharts Scatter clip-path to show edge points completely
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const sanitize = () => {
      const scatterLayers = chartContainerRef.current?.querySelectorAll('.recharts-scatter');
      scatterLayers?.forEach(el => {
        if (el.hasAttribute('clip-path')) {
          el.removeAttribute('clip-path');
        }
      });

      const wrappers = chartContainerRef.current?.querySelectorAll('.recharts-wrapper');
      wrappers?.forEach(el => {
        const wrapperEl = el as HTMLElement;
        wrapperEl.style.outline = 'none';
        wrapperEl.tabIndex = -1;
      });
    };

    const observer = new MutationObserver(sanitize);
    sanitize();
    observer.observe(chartContainerRef.current, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
  }, []);

  type RangeMode = "preset" | "custom";
  type RangeSelection = { mode: RangeMode; days: number; start: string; end: string };

  const [rangeInit] = useState(() => {
    const now = new Date();
    const defaultEnd = now;
    const defaultStart = new Date(now.getTime() - 6 * DAY_MS);
    const fallback: RangeSelection & { source: "global" | "local" } = {
      mode: "preset",
      days: 14,
      start: formatDateInputValue(defaultStart),
      end: formatDateInputValue(defaultEnd),
      source: "global"
    };

    if (typeof window === "undefined") return fallback;

    const parseSelection = (raw: string | null): RangeSelection | null => {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as Partial<RangeSelection>;
        if (!parsed) return null;
        const mode = parsed.mode === "custom" ? "custom" : "preset";
        const days = Number.isFinite(parsed.days) ? Math.max(1, Number(parsed.days)) : fallback.days;
        const start = parsed.start || fallback.start;
        const end = parsed.end || fallback.end;
        return { mode, days, start, end };
      } catch (err) {
        console.warn("Failed to parse range selection", err);
        return null;
      }
    };

    const globalSel = parseSelection(window.localStorage.getItem("rangeSelection"));
    const localSel = parseSelection(window.localStorage.getItem("rangeSelectionExplore"));

    if (globalSel) return { ...globalSel, source: "global" } as const;
    if (localSel) return { ...localSel, source: "local" } as const;
    return fallback;
  });

  const [rangeMode, setRangeMode] = useState<RangeMode>(rangeInit.mode);
  const [rangeDays, setRangeDays] = useState(rangeInit.days);
  const [customStart, setCustomStart] = useState(rangeInit.start);
  const [customEnd, setCustomEnd] = useState(rangeInit.end);
  const [appliedDays, setAppliedDays] = useState(rangeInit.days);
  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [customDraftStart, setCustomDraftStart] = useState(rangeInit.start);
  const [customDraftEnd, setCustomDraftEnd] = useState(rangeInit.end);
  const [customError, setCustomError] = useState<string | null>(null);
  const [selectionSource, setSelectionSource] = useState<"global" | "local">(rangeInit.source);
  const [globalSelection, setGlobalSelection] = useState<RangeSelection>({ mode: rangeInit.mode, days: rangeInit.days, start: rangeInit.start, end: rangeInit.end });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExploreResponse | null>(null);
  
  // Stacked area chart toggle
  const [showStackedArea, setShowStackedArea] = useState(true);
  
  const scatterTooltipRef = useRef<ScatterTooltipHandle>(null);

  // Persist page-specific selections, do not write back to dashboard
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectionSource !== "local") return;
    const payload: RangeSelection = { mode: rangeMode, days: rangeDays, start: customStart, end: customEnd };
    window.localStorage.setItem("rangeSelectionExplore", JSON.stringify(payload));
  }, [selectionSource, rangeMode, rangeDays, customStart, customEnd]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("rangeSelection");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<RangeSelection>;
      if (!parsed) return;
      const next: RangeSelection = {
        mode: parsed.mode === "custom" ? "custom" : "preset",
        days: Number.isFinite(parsed.days) ? Math.max(1, Number(parsed.days)) : rangeDays,
        start: parsed.start || customStart,
        end: parsed.end || customEnd
      };
      setGlobalSelection(next);
      if (selectionSource === "global") {
        setRangeMode(next.mode);
        setRangeDays(next.days);
        setCustomStart(next.start);
        setCustomEnd(next.end);
        setAppliedDays(next.days);
      }
    } catch (err) {
      console.warn("Failed to load global rangeSelection", err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  type ScatterTooltipHandle = {
    show: (point: ExplorePoint, x: number, y: number) => void;
    hide: () => void;
  };

  const ScatterTooltip = forwardRef<ScatterTooltipHandle, { getModelColor: (model: string) => string }>(
    ({ getModelColor }, ref) => {
      const [state, setState] = useState<{ point: ExplorePoint; x: number; y: number } | null>(null);
      const tooltipRef = useRef<HTMLDivElement>(null);

      useImperativeHandle(ref, () => ({
        show: (point, x, y) => setState({ point, x, y }),
        hide: () => setState(null)
      }), []);

      if (!state) return null;

      // Calculate tooltip position, avoid exceeding screen right edge
      const tooltipWidth = tooltipRef.current?.offsetWidth ?? 300; // Default estimated width
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
      
      // Default display on right side of cursor
      const defaultLeft = state.x + 12;
      
      // Check if it will exceed right edge (leave 20px margin)
      const wouldOverflow = defaultLeft + tooltipWidth > viewportWidth - 20;
      
      // Choose positioning method based on overflow
      const positionStyle = wouldOverflow
        ? { right: viewportWidth - state.x + 12 } // Use right positioning, show on left side of cursor
        : { left: defaultLeft }; // Use left positioning, show on right side of cursor

      return (
        <div 
          ref={tooltipRef}
          className="pointer-events-none fixed z-50 rounded-xl bg-slate-900/60 px-3 py-2 text-sm shadow-lg ring-1 ring-slate-600/60 backdrop-blur-sm"
          style={{ 
            ...positionStyle,
            top: state.y - 10,
            transform: 'translateY(-100%)'
          }}
        >
          <div className="font-semibold text-slate-100">{formatTs(state.point.ts)}</div>
          <div className="mt-1 flex items-center gap-2 text-slate-200">
            <span className="text-slate-400">Model:</span>
            <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getModelColor(state.point.model || ""), opacity: 0.7 }} />
            <span className="max-w-[22rem] truncate">{state.point.model || "-"}</span>
          </div>
          <div className="mt-1 text-slate-200">
            <span className="text-slate-400">Total Tokens:</span>
            <span>{formatNumberWithCommas(state.point.tokens)}</span>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-slate-200">
            <div>
              <span className="text-slate-400">Input:</span>
              <span style={{ color: TOKEN_COLORS.input }}>{formatNumberWithCommas(state.point.inputTokens)}</span>
            </div>
            <div>
              <span className="text-slate-400">Output:</span>
              <span style={{ color: TOKEN_COLORS.output }}>{formatNumberWithCommas(state.point.outputTokens)}</span>
            </div>
            <div>
              <span className="text-slate-400">Reasoning:</span>
              <span style={{ color: TOKEN_COLORS.reasoning }}>{formatNumberWithCommas(state.point.reasoningTokens)}</span>
            </div>
            <div>
              <span className="text-slate-400">Cached:</span>
              <span style={{ color: TOKEN_COLORS.cached }}>{formatNumberWithCommas(state.point.cachedTokens)}</span>
            </div>
          </div>
        </div>
      );
    }
  );
  ScatterTooltip.displayName = "ScatterTooltip";

  const points = useMemo(() => data?.points ?? [], [data]);

  // Brush selection area state
  const brushStartRef = useRef<{ x: number; y: number } | null>(null);
  const brushEndRef = useRef<{ x: number; y: number } | null>(null);
  const [isBrushing, setIsBrushing] = useState(false);
  
  // Zoomed view area
  const [zoomDomain, setZoomDomain] = useState<{ x: [number, number]; y: [number, number] } | null>(null);
  // Zoom source: 'brush' = main chart selection, 'range' = bottom range selector
  const [zoomSource, setZoomSource] = useState<'brush' | 'range' | null>(null);

  // X-axis range selector state (simplified: only supports dragging boundaries)
  const [isXRangeDragging, setIsXRangeDragging] = useState(false);
  const [xRangeDragType, setXRangeDragType] = useState<'left' | 'right' | 'move' | null>(null);
  const [xRangeDragStartX, setXRangeDragStartX] = useState<number | null>(null);
  const [xRangeOriginalDomain, setXRangeOriginalDomain] = useState<[number, number] | null>(null);
  const xRangeContainerRef = useRef<HTMLDivElement>(null);
  // Range selector hover state (for displaying time labels)
  const [xRangeHover, setXRangeHover] = useState<'left' | 'right' | 'box' | null>(null);
  // rAF merge X-axis range dragging, reduce frequent setState
  const xRangeUpdateFrameRef = useRef<number | null>(null);
  const pendingXRangeRef = useRef<[number, number] | null>(null);

  // Legend interaction state
  const [highlightedModel, setHighlightedModel] = useState<string | null>(null);
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());

  // Filtered points (excluding hidden models)
  const filteredPoints = useMemo(() => {
    if (hiddenModels.size === 0) return points;
    return points.filter(p => !hiddenModels.has(p.model));
  }, [points, hiddenModels]);

  const dataBounds = useMemo(() => {
    if (filteredPoints.length === 0) return null;
    let xMin = Number.POSITIVE_INFINITY;
    let xMax = Number.NEGATIVE_INFINITY;
    let yMin = Number.POSITIVE_INFINITY;
    let yMax = Number.NEGATIVE_INFINITY;
    for (const p of filteredPoints) {
      if (!Number.isFinite(p.ts) || !Number.isFinite(p.tokens)) continue;
      xMin = Math.min(xMin, p.ts);
      xMax = Math.max(xMax, p.ts);
      yMin = Math.min(yMin, p.tokens);
      yMax = Math.max(yMax, p.tokens);
    }
    if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || !Number.isFinite(yMin) || !Number.isFinite(yMax)) return null;
    return { x: niceDomain([xMin, xMax]), y: niceYDomain([yMin, yMax]) };
  }, [filteredPoints]);

  const flushXRangeUpdate = useCallback(() => {
    const pending = pendingXRangeRef.current;
    xRangeUpdateFrameRef.current = null;
    if (!pending) return;
    setZoomDomain(prev => prev
      ? { ...prev, x: pending }
      : { x: pending, y: dataBounds?.y ?? [0, 1] }
    );
    setZoomSource('range');
    pendingXRangeRef.current = null;
  }, [dataBounds]);

  const scheduleXRangeUpdate = useCallback((next: [number, number]) => {
    pendingXRangeRef.current = next;
    if (xRangeUpdateFrameRef.current == null) {
      xRangeUpdateFrameRef.current = requestAnimationFrame(flushXRangeUpdate);
    }
  }, [flushXRangeUpdate]);

  // Currently used domain (considering zoom)
  const activeDomain = useMemo<{ x: [number, number]; y: [number, number] } | null>(() => {
    if (!dataBounds) return null;
    if (!zoomDomain) return dataBounds;

    // If main chart selection, use selected range directly
    if (zoomSource === 'brush') {
      return zoomDomain;
    }

    // If bottom range selector, use selected range for X-axis, auto-calculate Y-axis based on points in current time range
    if (zoomSource === 'range') {
      const [xMin, xMax] = zoomDomain.x;
      let yMax = Number.NEGATIVE_INFINITY;
      let hasPoints = false;

      for (const p of filteredPoints) {
        if (p.ts >= xMin && p.ts <= xMax) {
          yMax = Math.max(yMax, p.tokens);
          hasPoints = true;
        }
      }

      if (!hasPoints) {
        return { x: zoomDomain.x, y: dataBounds.y };
      }

      // Keep Y-axis bottom fixed (use global padded lower bound), only top adapts to visible range
      const fixedBottom = dataBounds.y[0];
      const [, paddedTop] = niceYDomain([fixedBottom, yMax]);
      return { x: zoomDomain.x, y: [fixedBottom, paddedTop] as [number, number] };
    }

    return zoomDomain;
  }, [dataBounds, zoomDomain, zoomSource, filteredPoints]);

  // Only render scatter points within visible range, use count for animation degradation
  const visiblePoints = useMemo(() => {
    if (!activeDomain) return filteredPoints;
    const [xMin, xMax] = activeDomain.x;
    const [yMin, yMax] = activeDomain.y;
    return filteredPoints.filter(p => 
      p.ts >= xMin && p.ts <= xMax && p.tokens >= yMin && p.tokens <= yMax
    );
  }, [filteredPoints, activeDomain]);

  // Use smooth transition for Y-axis domain (Lerp animation)
  // Disable animation during brush zoom, only enable smooth transition for range selector zoom
  const enableLerpAnimation = zoomSource === 'range';
  const smoothYDomain = useLerpYDomain(activeDomain?.y, 0.15, enableLerpAnimation);

  // Calculate ticks based on current rendered domain, ensure ticks match displayed values
  const computedYTicks = useMemo(() => {
    const domain = smoothYDomain || activeDomain?.y;
    if (!domain) return undefined;
    return computeNiceTicks(domain);
  }, [smoothYDomain, activeDomain?.y]);

  // Calculate X-axis time ticks, ensure boundary ticks display correctly
  const computedXTicks = useMemo(() => {
    if (!activeDomain?.x) return undefined;
    return computeTimeTicks(activeDomain.x);
  }, [activeDomain?.x]);

  // Calculate Y-axis distribution (histogram data for token counts)
  const yDistribution = useMemo(() => {
    if (!activeDomain || filteredPoints.length === 0) return [];
    
    const [yMin, yMax] = activeDomain.y;
    const binCount = 50; // More bins for smoother curve
    const binSize = (yMax - yMin) / binCount;
    const bins = new Array(binCount).fill(0);
    
    for (const p of filteredPoints) {
      if (p.tokens < yMin || p.tokens > yMax) continue;
      const binIndex = Math.min(Math.floor((p.tokens - yMin) / binSize), binCount - 1);
      bins[binIndex]++;
    }
    
    // Return sorted top to bottom (Y-axis top corresponds to high token values)
    return bins.map((count, i) => ({
      y: yMin + (i + 0.5) * binSize,
      count
    })).reverse();
  }, [activeDomain, filteredPoints]);

  // Calculate X-axis distribution (area chart data for time distribution, for range selector)
  const xDistribution = useMemo(() => {
    if (!dataBounds || filteredPoints.length === 0) return [];

    const [xMin, xMax] = dataBounds.x;
    const binCount = 100; // More bins for smoother curve
    const binSize = (xMax - xMin) / binCount;
    const bins = new Array(binCount).fill(0);

    for (const p of filteredPoints) {
      if (p.ts < xMin || p.ts > xMax) continue;
      const binIndex = Math.min(Math.floor((p.ts - xMin) / binSize), binCount - 1);
      bins[binIndex] += p.tokens; // Accumulate tokens instead of counting
    }
    
    return bins.map((totalTokens, i) => ({
      ts: xMin + (i + 0.5) * binSize,
      tokens: totalTokens
    }));
  }, [dataBounds, filteredPoints]);

  // Store chart area info for coordinate conversion
  const chartAreaRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  // Store pixel-level brush position (for displaying selection box)
  const brushPixelStartRef = useRef<{ x: number; y: number } | null>(null);
  const brushPixelEndRef = useRef<{ x: number; y: number } | null>(null);
  const brushOverlayRef = useRef<HTMLDivElement>(null);

  // Use rAF to merge high-frequency mouse events, avoid frame drops from too many state updates
  const brushMoveFrameRef = useRef<number | null>(null);
  const pendingBrushUpdateRef = useRef<{
    pixel: { x: number; y: number };
    data: { x: number; y: number };
  } | null>(null);

  const applyBrushOverlay = useCallback(() => {
    if (!brushOverlayRef.current || !brushPixelStartRef.current || !brushPixelEndRef.current) return;
    const start = brushPixelStartRef.current;
    const end = brushPixelEndRef.current;
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    const el = brushOverlayRef.current;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
  }, []);

  // Use DOM events for brush operations, as recharts events may not trigger in blank areas of ScatterChart
  const handleContainerMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!chartContainerRef.current || !activeDomain) return;

    const containerRect = chartContainerRef.current.getBoundingClientRect();

    // Try to find CartesianGrid inside SVG to determine actual drawing area
    const gridElement = chartContainerRef.current.querySelector('.recharts-cartesian-grid');
    let area: { x: number; y: number; width: number; height: number };

    if (gridElement) {
      const gridRect = gridElement.getBoundingClientRect();
      area = {
        x: gridRect.left - containerRect.left,
        y: gridRect.top - containerRect.top,
        width: gridRect.width,
        height: gridRect.height
      };
    } else {
      // Fallback to using margin calculation
      area = {
        x: CHART_MARGIN.left,
        y: CHART_MARGIN.top,
        width: containerRect.width - CHART_MARGIN.left - CHART_MARGIN.right,
        height: containerRect.height - CHART_MARGIN.top - CHART_MARGIN.bottom
      };
    }
    chartAreaRef.current = area;

    // Calculate coordinates relative to container
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;

    // Check if within chart area
    if (mouseX < area.x || mouseX > area.x + area.width || mouseY < area.y || mouseY > area.y + area.height) {
      return;
    }

    // Store pixel coordinates
    brushPixelStartRef.current = { x: mouseX, y: mouseY };
    brushPixelEndRef.current = { x: mouseX, y: mouseY };
    brushOverlayRef.current && (brushOverlayRef.current.style.display = 'block');
    applyBrushOverlay();

    // Convert to data coordinates
    const xRatio = clamp((mouseX - area.x) / area.width, 0, 1);
    const yRatio = clamp(1 - (mouseY - area.y) / area.height, 0, 1);
    
    const xValue = activeDomain.x[0] + xRatio * (activeDomain.x[1] - activeDomain.x[0]);
    const yValue = activeDomain.y[0] + yRatio * (activeDomain.y[1] - activeDomain.y[0]);
    
    brushStartRef.current = { x: xValue, y: yValue };
    brushEndRef.current = { x: xValue, y: yValue };
    setIsBrushing(true);
  }, [activeDomain, applyBrushOverlay]);

  // rAF-driven mouse move handler, reduce React render frequency
  const handleContainerMouseMoveWithRaf = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isBrushing || !chartContainerRef.current || !activeDomain || !chartAreaRef.current) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const area = chartAreaRef.current;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const xRatio = clamp((mouseX - area.x) / area.width, 0, 1);
    const yRatio = clamp(1 - (mouseY - area.y) / area.height, 0, 1);

    const xValue = activeDomain.x[0] + xRatio * (activeDomain.x[1] - activeDomain.x[0]);
    const yValue = activeDomain.y[0] + yRatio * (activeDomain.y[1] - activeDomain.y[0]);

    pendingBrushUpdateRef.current = {
      pixel: { x: mouseX, y: mouseY },
      data: { x: xValue, y: yValue }
    };

    if (brushMoveFrameRef.current == null) {
      brushMoveFrameRef.current = requestAnimationFrame(() => {
        const pending = pendingBrushUpdateRef.current;
        brushMoveFrameRef.current = null;
        if (!pending) return;
        brushPixelEndRef.current = pending.pixel;
        brushEndRef.current = pending.data;
        applyBrushOverlay();
      });
    }
  }, [isBrushing, activeDomain, applyBrushOverlay]);

  const handleContainerMouseUp = useCallback(() => {
    const start = brushStartRef.current;
    const end = brushEndRef.current;
    if (!isBrushing || !start || !end) {
      setIsBrushing(false);
      brushStartRef.current = null;
      brushEndRef.current = null;
      brushPixelStartRef.current = null;
      brushPixelEndRef.current = null;
      if (brushOverlayRef.current) brushOverlayRef.current.style.display = 'none';
      return;
    }

    const xMin = Math.min(start.x, end.x);
    const xMax = Math.max(start.x, end.x);
    const yMin = Math.min(start.y, end.y);
    const yMax = Math.max(start.y, end.y);

    // Need sufficient selection range to trigger zoom (2% of current view range)
    const currentDomain = activeDomain ?? dataBounds;
    const xRange = currentDomain ? currentDomain.x[1] - currentDomain.x[0] : 1;
    const yRange = currentDomain ? currentDomain.y[1] - currentDomain.y[0] : 1;

    if ((xMax - xMin) > xRange * 0.02 && (yMax - yMin) > yRange * 0.02) {
      setZoomDomain({ x: [xMin, xMax], y: [yMin, yMax] });
      setZoomSource('brush'); // Main chart brush zoom
    }

    setIsBrushing(false);
    brushStartRef.current = null;
    brushEndRef.current = null;
    brushPixelStartRef.current = null;
    brushPixelEndRef.current = null;
    if (brushOverlayRef.current) brushOverlayRef.current.style.display = 'none';
  }, [isBrushing, activeDomain, dataBounds]);

  // Cancel rAF on component unmount to avoid lingering tasks
  useEffect(() => {
    return () => {
      if (brushMoveFrameRef.current != null) {
        cancelAnimationFrame(brushMoveFrameRef.current);
      }
      if (xRangeUpdateFrameRef.current != null) {
        cancelAnimationFrame(xRangeUpdateFrameRef.current);
      }
    };
  }, []);

  // Reset zoom
  const resetZoom = useCallback(() => {
    setZoomDomain(null);
    setZoomSource(null);
  }, []);

  // X-axis range selector event handling (only supports dragging left/right boundaries)
  const handleXRangeMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!xRangeContainerRef.current || !dataBounds) return;

    const rect = xRangeContainerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    // Get current selection range (use full range if none)
    const currentSelection = zoomDomain?.x ?? dataBounds.x;
    const selectionStartRatio = (currentSelection[0] - dataBounds.x[0]) / (dataBounds.x[1] - dataBounds.x[0]);
    const selectionEndRatio = (currentSelection[1] - dataBounds.x[0]) / (dataBounds.x[1] - dataBounds.x[0]);
    const selectionStartPx = selectionStartRatio * rect.width;
    const selectionEndPx = selectionEndRatio * rect.width;
    const handleSize = 12;

    // Switch to range mode whenever range selector is clicked, ensure Y-axis auto-adaptation works
    setZoomSource('range');

    // Check if on left edge
    if (Math.abs(mouseX - selectionStartPx) < handleSize) {
      setXRangeDragType('left');
      setIsXRangeDragging(true);
      setXRangeDragStartX(mouseX);
      setXRangeOriginalDomain(currentSelection);
      return;
    }
    // Check if on right edge
    if (Math.abs(mouseX - selectionEndPx) < handleSize) {
      setXRangeDragType('right');
      setIsXRangeDragging(true);
      setXRangeDragStartX(mouseX);
      setXRangeOriginalDomain(currentSelection);
      return;
    }
    // Check if inside selection box (draggable for moving)
    if (mouseX > selectionStartPx && mouseX < selectionEndPx) {
      setXRangeDragType('move');
      setIsXRangeDragging(true);
      setXRangeDragStartX(mouseX);
      setXRangeOriginalDomain(currentSelection);
      return;
    }

    // Click empty area: jump selection box center to click position
    const clickRatio = mouseX / rect.width;
    const clickTime = dataBounds.x[0] + clickRatio * (dataBounds.x[1] - dataBounds.x[0]);
    const rangeSize = currentSelection[1] - currentSelection[0];
    const halfRange = rangeSize / 2;

    let newStart = clickTime - halfRange;
    let newEnd = clickTime + halfRange;

    // Constrain to data range
    if (newStart < dataBounds.x[0]) {
      newStart = dataBounds.x[0];
      newEnd = dataBounds.x[0] + rangeSize;
    }
    if (newEnd > dataBounds.x[1]) {
      newEnd = dataBounds.x[1];
      newStart = dataBounds.x[1] - rangeSize;
    }
    
    setZoomDomain(prev => prev 
      ? { ...prev, x: [newStart, newEnd] } 
      : { x: [newStart, newEnd], y: dataBounds.y }
    );
  }, [dataBounds, zoomDomain]);

  // X-axis range selector wheel zoom - use native events to support preventDefault
  useEffect(() => {
    const container = xRangeContainerRef.current;
    if (!container || !dataBounds) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseRatio = clamp(mouseX / rect.width, 0, 1);
      const mouseTime = dataBounds.x[0] + mouseRatio * (dataBounds.x[1] - dataBounds.x[0]);

      const currentSelection = zoomDomain?.x ?? dataBounds.x;
      const currentRange = currentSelection[1] - currentSelection[0];
      const fullRange = dataBounds.x[1] - dataBounds.x[0];

      // Zoom factor: scroll up to shrink range, scroll down to expand range
      const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;
      let newRange = currentRange * zoomFactor;

      // Constrain minimum range to 2% of total range, maximum to full range
      const minRange = fullRange * 0.02;
      newRange = clamp(newRange, minRange, fullRange);

      // Zoom with mouse position as anchor
      const leftRatio = (mouseTime - currentSelection[0]) / currentRange;
      const rightRatio = (currentSelection[1] - mouseTime) / currentRange;

      let newStart = mouseTime - newRange * leftRatio;
      let newEnd = mouseTime + newRange * rightRatio;

      // Constrain to data range
      if (newStart < dataBounds.x[0]) {
        newStart = dataBounds.x[0];
        newEnd = dataBounds.x[0] + newRange;
      }
      if (newEnd > dataBounds.x[1]) {
        newEnd = dataBounds.x[1];
        newStart = dataBounds.x[1] - newRange;
      }

      // Reset if zoomed to near full range
      if (newRange >= fullRange * 0.98) {
        setZoomDomain(null);
        setZoomSource(null);
      } else {
        setZoomDomain(prev => prev 
          ? { ...prev, x: [newStart, newEnd] } 
          : { x: [newStart, newEnd], y: dataBounds.y }
        );
        setZoomSource('range');
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [dataBounds, zoomDomain]);

  // Global mouse event handling, support dragging outside container
  useEffect(() => {
    if (!isXRangeDragging) return;

    const handleMouseMoveRaw = (e: MouseEvent) => {
      if (!xRangeContainerRef.current || !dataBounds || !xRangeOriginalDomain) return;

      const rect = xRangeContainerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      // Allow dragging outside container, but constrain xRatio within reasonable range (though clamp limits 0-1, we can use raw value for delta calculation)
      // Here we still clamp xRatio for calculating xValue, but for move operation we need unclamped delta

      const xRatio = clamp(mouseX / rect.width, 0, 1);
      const xValue = dataBounds.x[0] + xRatio * (dataBounds.x[1] - dataBounds.x[0]);

      const minRange = (dataBounds.x[1] - dataBounds.x[0]) * 0.02; // Minimum range 2%

      if (xRangeDragType === 'left') {
        const newStart = Math.min(xValue, xRangeOriginalDomain[1] - minRange);
        const clampedStart = Math.max(newStart, dataBounds.x[0]);
        scheduleXRangeUpdate([clampedStart, xRangeOriginalDomain[1]]);
      } else if (xRangeDragType === 'right') {
        const newEnd = Math.max(xValue, xRangeOriginalDomain[0] + minRange);
        const clampedEnd = Math.min(newEnd, dataBounds.x[1]);
        scheduleXRangeUpdate([xRangeOriginalDomain[0], clampedEnd]);
      } else if (xRangeDragType === 'move' && xRangeDragStartX !== null) {
        const deltaX = mouseX - xRangeDragStartX;
        const deltaRatio = deltaX / rect.width;
        const deltaValue = deltaRatio * (dataBounds.x[1] - dataBounds.x[0]);
        const rangeSize = xRangeOriginalDomain[1] - xRangeOriginalDomain[0];

        let newStart = xRangeOriginalDomain[0] + deltaValue;
        let newEnd = xRangeOriginalDomain[1] + deltaValue;

        // Constrain to data range
        if (newStart < dataBounds.x[0]) {
          newStart = dataBounds.x[0];
          newEnd = dataBounds.x[0] + rangeSize;
        }
        if (newEnd > dataBounds.x[1]) {
          newEnd = dataBounds.x[1];
          newStart = dataBounds.x[1] - rangeSize;
        }

        scheduleXRangeUpdate([newStart, newEnd]);
      }
    };

    const handleMouseUp = () => {
      // Check if current selection range covers full data range, reset if so
      if (dataBounds && zoomDomain) {
        const fullRange = dataBounds.x[1] - dataBounds.x[0];
        const startNearBound = Math.abs(zoomDomain.x[0] - dataBounds.x[0]) < fullRange * 0.001;
        const endNearBound = Math.abs(zoomDomain.x[1] - dataBounds.x[1]) < fullRange * 0.001;
        
        if (startNearBound && endNearBound) {
          setZoomDomain(null);
          setZoomSource(null);
        }
      }
      
      setIsXRangeDragging(false);
      setXRangeDragType(null);
      setXRangeDragStartX(null);
      setXRangeOriginalDomain(null);
    };

    window.addEventListener('mousemove', handleMouseMoveRaw);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMoveRaw);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isXRangeDragging, dataBounds, xRangeDragType, xRangeDragStartX, xRangeOriginalDomain, zoomDomain, scheduleXRangeUpdate]);

  // Reset zoom when data changes
  useEffect(() => {
    setZoomDomain(null);
    setZoomSource(null);
  }, [points]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "rangeSelection") return;
      const raw = e.newValue;
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Partial<RangeSelection>;
        if (!parsed) return;
        const next: RangeSelection = {
          mode: parsed.mode === "custom" ? "custom" : "preset",
          days: Number.isFinite(parsed.days) ? Math.max(1, Number(parsed.days)) : rangeDays,
          start: parsed.start || customStart,
          end: parsed.end || customEnd
        };
        setGlobalSelection(next);
        if (selectionSource === "global") {
          setRangeMode(next.mode);
          setRangeDays(next.days);
          setCustomStart(next.start);
          setCustomEnd(next.end);
          setAppliedDays(next.days);
        }
      } catch (err) {
        console.warn("Failed to sync rangeSelection", err);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [selectionSource, rangeDays, customStart, customEnd]);

  useEffect(() => {
    if (rangeMode === "custom" && (!customStart || !customEnd)) return;

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (rangeMode === "custom") {
          params.set("start", customStart);
          params.set("end", customEnd);
        } else {
          params.set("days", String(rangeDays));
        }

        const res = await fetch(`/api/explore?${params.toString()}`, { cache: "no-store" });
        const json: ExploreResponse = await res.json();

        if (!res.ok) {
          throw new Error(json?.error || res.statusText);
        }

        if (!cancelled) {
          setData(json);
          setAppliedDays(json.days ?? rangeDays);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || "Failed to load");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [rangeMode, customStart, customEnd, rangeDays]);

  const models = useMemo(() => {
    const set = new Set<string>();
    for (const p of points) {
      if (p.model) set.add(p.model);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [points]);

  const isUsingGlobalRange = selectionSource === "global";

  const presetDateLabel = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - Math.max(0, appliedDays - 1) * DAY_MS);
    return `${formatDateInputValue(start)} ~ ${formatDateInputValue(end)}`;
  }, [appliedDays]);

  const rangeSubtitle = useMemo(() => {
    if (rangeMode === "custom" && customStart && customEnd) {
      return `${customStart} ~ ${customEnd}${isUsingGlobalRange ? " (following dashboard)" : ""}`;
    }
    return `${presetDateLabel}${isUsingGlobalRange ? " (following dashboard)" : ""}`;
  }, [rangeMode, customStart, customEnd, isUsingGlobalRange, presetDateLabel]);

  // Calculate stacked area chart data (grouped by time, accumulated tokens per model)
  const stackedAreaData = useMemo(() => {
    if (!activeDomain || filteredPoints.length === 0 || models.length === 0) return [];

    const [xMin, xMax] = activeDomain.x;
    const rangeMs = xMax - xMin;
    if (!Number.isFinite(rangeMs) || rangeMs <= 0) return [];

    // Fixed time granularity + aligned boundaries: avoid overall bucket drift from slight time range changes
    const targetBins = 60;
    const niceIntervalsMs = [
      1 * 60_000,
      2 * 60_000,
      5 * 60_000,
      10 * 60_000,
      15 * 60_000,
      30 * 60_000,
      60 * 60_000,
      2 * 60 * 60_000,
      3 * 60 * 60_000,
      6 * 60 * 60_000,
      12 * 60 * 60_000,
      24 * 60 * 60_000,
      2 * 24 * 60 * 60_000,
      7 * 24 * 60 * 60_000
    ];

    const ideal = rangeMs / targetBins;
    const intervalMs = niceIntervalsMs.find((v) => v >= ideal) ?? niceIntervalsMs[niceIntervalsMs.length - 1];

    const startIndex = Math.floor(xMin / intervalMs);
    const endIndex = Math.ceil(xMax / intervalMs);
    const binCount = Math.max(1, endIndex - startIndex);

    // Initialize model accumulation for each time bucket (ts is bucket center point)
    const bins: Array<Record<string, number> & { ts: number }> = [];
    for (let i = 0; i < binCount; i++) {
      const bucketStart = (startIndex + i) * intervalMs;
      const bin: Record<string, number> & { ts: number } = { ts: bucketStart + intervalMs / 2 };
      for (const m of models) bin[m] = 0;
      bins.push(bin);
    }

    // Accumulate each point to corresponding bucket (aligned by absolute time)
    for (const p of filteredPoints) {
      if (p.ts < xMin || p.ts > xMax) continue;
      if (!p.model) continue;
      const idx = Math.floor(p.ts / intervalMs) - startIndex;
      if (idx < 0 || idx >= binCount) continue;
      bins[idx][p.model] = (bins[idx][p.model] || 0) + p.tokens;
    }

    return bins;
  }, [activeDomain, filteredPoints, models]);

  // Maximum value of stacked area chart (for normalization to left Y-axis)
  const stackedMaxSum = useMemo((): number => {
    if (stackedAreaData.length === 0 || models.length === 0) return 1;
    let maxSum = 0;
    for (const bin of stackedAreaData) {
      let sum = 0;
      for (const m of models) {
        sum += bin[m] || 0;
      }
      maxSum = Math.max(maxSum, sum);
    }
    return maxSum || 1;
  }, [stackedAreaData, models]);

  // Cache Y-axis tick labels to reduce redundant tickFormatter calculations
  const yTickLabelMap = useMemo(() => {
    if (!computedYTicks) return null;

    const labels = new Map<number, string>();
    for (const tick of computedYTicks) {
      const num = Number(tick);
      if (num < 0) continue;
      const scatterLabel = formatCompactNumber(num);

      if (showStackedArea && activeDomain) {
        const scatterTop = activeDomain.y[1] || 1;
        const stackedValue = (num / scatterTop) * stackedMaxSum;
        labels.set(num, `${scatterLabel} (${formatCompactNumber(stackedValue)})`);
      } else {
        labels.set(num, scatterLabel);
      }
    }
    return labels;
  }, [computedYTicks, showStackedArea, activeDomain, stackedMaxSum]);

  // Normalize stacked data - map stacked values to scatter plot Y-axis range
  const normalizedStackedData = useMemo(() => {
    if (!showStackedArea || stackedAreaData.length === 0 || !activeDomain) return stackedAreaData;
    
    const scatterYMax = activeDomain.y[1];
    const scale = scatterYMax / stackedMaxSum;
    
    return stackedAreaData.map(bin => {
      const normalized: Record<string, number> & { ts: number } = { ts: bin.ts };
      for (const m of models) {
        normalized[m] = (bin[m] || 0) * scale;
      }
      return normalized;
    });
  }, [showStackedArea, stackedAreaData, stackedMaxSum, activeDomain, models]);

  // Performance optimization: only render stacked area data within visible range
  const visibleStackedData = useMemo(() => {
    if (!activeDomain) return normalizedStackedData;
    const [xMin, xMax] = activeDomain.x;
    return normalizedStackedData.filter(d => 
      d.ts >= xMin && d.ts <= xMax
    );
  }, [normalizedStackedData, activeDomain]);

  // Assign colors based on model index in list, avoid hash collisions
  const modelColorMap = useMemo(() => {
    const map = new Map<string, string>();
    models.forEach((m, idx) => {
      map.set(m, MODEL_COLORS[idx % MODEL_COLORS.length]);
    });
    return map;
  }, [models]);

  const getModelColor = useCallback((model: string) => {
    return modelColorMap.get(model) ?? MODEL_COLORS[0];
  }, [modelColorMap]);

  // Use ref to store highlight state, avoid dotShape rebuilding due to highlight changes
  const highlightedModelRef = useRef(highlightedModel);
  const zoomSourceRef = useRef(zoomSource);
  
  useEffect(() => {
    highlightedModelRef.current = highlightedModel;
  }, [highlightedModel]);
  
  useEffect(() => {
    zoomSourceRef.current = zoomSource;
  }, [zoomSource]);

  const mainChartMargin = useMemo(() => ({
    ...CHART_MARGIN,
    top: CHART_MARGIN.top + CHART_TOP_INSET
  }), []);

  const cartesianGridProps = useMemo(() => ({
    yAxisId: "left",
    strokeDasharray: "3 3",
    stroke: "#64748b",
    strokeOpacity: 0.6,
    horizontal: true,
    vertical: true
  }), []);

  // Scatter plot dot shape component - only depends on modelColorMap, access others via ref
  const dotShape = useMemo(() => {
    return function Dot(props: any) {
      const { cx, cy, payload } = props;
      if (cx == null || cy == null) return <g />;
      const model = String(payload?.model ?? "");
      const fill = modelColorMap.get(model) ?? MODEL_COLORS[0];
      const currentHighlighted = highlightedModelRef.current;
      const currentZoomSource = zoomSourceRef.current;
      const isHighlighted = currentHighlighted === model;

      // Only enlarge dots during brush zoom, not during range selector zoom
      const baseRadius = currentZoomSource === 'brush' ? 5 : 3;
      const radius = isHighlighted ? baseRadius + 1 : baseRadius;

      return (
        <g style={{ cursor: 'pointer' }}>
          {/* Transparent area to expand clickable region */}
          <circle
            cx={cx}
            cy={cy}
            r={radius + 3}
            fill="transparent"
          />
          {/* Visible dot */}
          <circle 
            cx={cx} 
            cy={cy} 
            r={radius} 
            fill={fill} 
            fillOpacity={currentHighlighted && !isHighlighted ? 0.15 : 0.68}
            stroke={isHighlighted ? "#ffffffce" : "none"}
            strokeWidth={isHighlighted ? 1.2 : 0}
          />
        </g>
      );
    };
  }, [modelColorMap]);

  // Legend interaction handling
  const handleLegendMouseEnter = useCallback((model: string) => {
    setHighlightedModel(model);
  }, []);

  const handleLegendMouseLeave = useCallback(() => {
    setHighlightedModel(null);
  }, []);

  const handleLegendClick = useCallback((model: string) => {
    setHiddenModels(prev => {
      const next = new Set(prev);
      if (next.has(model)) {
        next.delete(model);
      } else {
        next.add(model);
      }
      return next;
    });
  }, []);

  const clearHover = useCallback(() => {
    scatterTooltipRef.current?.hide();
  }, []);

  const commitHover = useCallback((payload: ExplorePoint, x: number, y: number) => {
    scatterTooltipRef.current?.show(payload, x, y);
  }, []);

  const applyPresetRange = useCallback((days: number) => {
    setSelectionSource("local");
    setRangeMode("preset");
    setRangeDays(days);
    setAppliedDays(days);
    setCustomPickerOpen(false);
    setCustomError(null);
  }, []);

  const applyCustomRange = useCallback(() => {
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
    setSelectionSource("local");
    setRangeMode("custom");
    setCustomStart(customDraftStart);
    setCustomEnd(customDraftEnd);
    const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1);
    setRangeDays(days);
    setAppliedDays(days);
    setCustomPickerOpen(false);
  }, [customDraftStart, customDraftEnd]);

  const applyDashboardRange = useCallback(() => {
    const next = globalSelection;
    setSelectionSource("global");
    setRangeMode(next.mode);
    setRangeDays(next.days);
    setCustomStart(next.start);
    setCustomEnd(next.end);
    setAppliedDays(next.days);
    setCustomPickerOpen(false);
    setCustomError(null);
  }, [globalSelection]);

    return (
      <main className="min-h-screen bg-slate-900 px-6 pb-4 pt-8 text-slate-100">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Data Exploration</h1>
          <p className="text-sm text-slate-400">Each point represents a request (X=time, Y=token count, color=model)</p>
        </div>
        <div className="flex flex-col items-start gap-2 text-sm text-slate-300 md:items-end">
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                onClick={() => applyPresetRange(days)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  rangeMode === "preset" && selectionSource === "local" && rangeDays === days
                    ? "border-indigo-500 bg-indigo-500/20 text-indigo-100"
                    : "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500"
                }`}
              >
                Last {days} days
              </button>
            ))}
            <div className="relative">
              <button
                onClick={() => {
                  setCustomPickerOpen((open) => !open);
                  setCustomDraftStart(customStart);
                  setCustomDraftEnd(customEnd);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  rangeMode === "custom" && selectionSource === "local"
                    ? "border-indigo-500 bg-indigo-500/20 text-indigo-100"
                    : "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500"
                }`}
              >
                Custom
              </button>
              {customPickerOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
                  <div className="space-y-3 text-sm">
                    <div className="grid grid-cols-1 gap-2">
                      <label className="text-slate-300">
                        Start date
                        <input
                          type="date"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                          value={customDraftStart}
                          max={customDraftEnd || undefined}
                          onChange={(e) => setCustomDraftStart(e.target.value)}
                        />
                      </label>
                      <label className="text-slate-300">
                        End date
                        <input
                          type="date"
                          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                          value={customDraftEnd}
                          min={customDraftStart || undefined}
                          onChange={(e) => setCustomDraftEnd(e.target.value)}
                        />
                      </label>
                    </div>
                    {customError ? <p className="text-xs text-red-400">{customError}</p> : null}
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCustomPickerOpen(false);
                          setCustomError(null);
                          setCustomDraftStart(customStart);
                          setCustomDraftEnd(customEnd);
                        }}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={applyCustomRange}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <button
              onClick={applyDashboardRange}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                selectionSource === "global"
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-100"
                  : "border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500"
              }`}
            >
              Follow dashboard
            </button>
          </div>
          <div className="text-xs text-slate-400">
            <span className="text-slate-500">Time range: </span>
            <span>{rangeSubtitle}</span>
            {data?.step && data.step > 1 ? <span className="ml-3 text-slate-500">{`Sampled: 1 in every ${data.step} points`}</span> : null}
          </div>
        </div>
      </header>

      <section className="mt-6 rounded-2xl bg-slate-950/40 p-5 ring-1 ring-slate-800">
        <div className="flex min-h-[28px] flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-300">
          <div>
            <span className="text-slate-400">Total points: </span>
            <span>{formatNumberWithCommas(data?.total ?? 0)}</span>
          </div>
          <div>
            <span className="text-slate-400">Rendered points: </span>
            <span>{formatNumberWithCommas(visiblePoints.length)}</span>
          </div>
          {zoomDomain && dataBounds && (() => {
            const totalXRange = dataBounds.x[1] - dataBounds.x[0];
            const zoomXRange = zoomDomain.x[1] - zoomDomain.x[0];
            const zoomRatio = totalXRange > 0 ? zoomXRange / totalXRange : 1;
            return zoomRatio < 0.999;
          })() && (
            <button
              type="button"
              onClick={resetZoom}
              className="rounded-lg bg-slate-600/90 px-3 py-1 text-xs text-slate-100 transition-colors hover:bg-slate-500"
            >
              Reset zoom
            </button>
          )}
          <div className="ml-auto flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400 hover:text-slate-300">
              <button
                type="button"
                role="switch"
                aria-checked={showStackedArea}
                onClick={() => setShowStackedArea(!showStackedArea)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
                  showStackedArea ? 'bg-blue-500' : 'bg-slate-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    showStackedArea ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span>Model stacked distribution</span>
            </label>
            <span className="text-xs text-slate-500">Tip: Drag to select and zoom area</span>
          </div>
        </div>

        <ModelLegend
          models={models}
          hiddenModels={hiddenModels}
          getModelColor={getModelColor}
          onMouseEnter={handleLegendMouseEnter}
          onMouseLeave={handleLegendMouseLeave}
          onClick={handleLegendClick}
        />

        <div className="mt-4 flex h-[75vh] flex-col gap-0">
          {loading ? (
            <Skeleton className="h-full" />
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/30 text-center">
                  <p className="text-base text-slate-200">Failed to load</p>
                  <p className="mt-1 text-sm text-slate-400">{error}</p>
            </div>
          ) : points.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/30 text-center">
                  <p className="text-base text-slate-200">No request detail data</p>
                  <p className="mt-1 text-sm text-slate-400">If upstream /usage does not provide details, this chart will be empty.</p>
            </div>
          ) : (
            <>
            {/* Main chart area */}
            <div className="relative flex flex-1 gap-0">
              {/* Y-axis distribution area chart (vertical, peaks to the left) - use absolute positioning for precise alignment */}
              <div 
                className="absolute left-0 w-16 pointer-events-none"
                style={{ 
                  top: CHART_MARGIN.top + CHART_TOP_INSET - 2, 
                  height: `calc(94.5% - ${CHART_MARGIN.top + CHART_TOP_INSET}px - ${CHART_MARGIN.bottom}px)` 
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart 
                    data={yDistribution} 
                    layout="vertical"
                    margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="yDistGradient" x1="1" y1="0" x2="0" y2="0">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.08} />
                        <stop offset="40%" stopColor="#60a5fa" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.7} />
                      </linearGradient>
                    </defs>
                    <XAxis type="number" hide domain={[0, 'dataMax']} reversed />
                    <YAxis type="category" dataKey="y" hide />
                    <Area 
                      type="basis" 
                        dataKey="count" 
                        stroke="#7cc5ff" 
                        strokeWidth={1.5}
                        strokeOpacity={0.75}
                      fill="url(#yDistGradient)" 
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Main scatter plot - leave space for area chart on the left */}
              <div 
                ref={chartContainerRef} 
                className="relative flex-1 select-none focus:outline-none focus-visible:outline-none"
                style={{ marginLeft: 64 }}
                tabIndex={-1}
                onMouseDown={handleContainerMouseDown}
                onMouseMove={handleContainerMouseMoveWithRaf}
                onMouseUp={handleContainerMouseUp}
                onMouseLeave={() => {
                  handleContainerMouseUp();
                  clearHover();
                }}
                onDoubleClick={zoomDomain ? resetZoom : undefined}
              >
                {/* Brush selection area visualization - direct DOM update to avoid frequent re-renders */}
                <div
                  ref={brushOverlayRef}
                  className="pointer-events-none absolute border border-blue-400/80 bg-blue-400/15"
                  style={{ display: 'none' }}
                />
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart 
                  margin={mainChartMargin}
                  data={visibleStackedData}
                  onMouseLeave={clearHover}
                >
                    <XAxis
                      type="number"
                      dataKey="ts"
                      domain={activeDomain?.x}
                      scale="time"
                      tickFormatter={(v) => formatTs(Number(v))}
                      stroke="#cbd5e1"
                      fontSize={13}
                      allowDataOverflow
                      axisLine={false}
                      ticks={computedXTicks}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      yAxisId="left"
                      type="number"
                      dataKey="tokens"
                      domain={smoothYDomain || activeDomain?.y}
                      stroke="#cbd5e1"
                      fontSize={13}
                      ticks={computedYTicks}
                      interval="preserveStartEnd"
                      tickMargin={6}
                      tickFormatter={(v) => {
                        const num = Number(v);
                        const cached = yTickLabelMap?.get(num);
                        if (cached !== undefined) return cached;
                        if (num < 0) return '';
                        return formatCompactNumber(num);
                      }}
                      allowDataOverflow
                    />
                    {/* Stacked area chart - as background below scatter points */}
                    {showStackedArea && models.map((model) => (
                      <Area
                        key={model}
                        yAxisId="left"
                        type="monotone"
                        dataKey={model}
                        stackId="tokens"
                        stroke="none"
                        fill={getModelColor(model)}
                        fillOpacity={
                          hiddenModels.has(model) 
                            ? 0 
                            : highlightedModel === null || highlightedModel === model
                              ? 0.3
                              : 0.1
                        }
                        isAnimationActive={false}
                      />
                    ))}
                  <CartesianGrid {...cartesianGridProps} />
                  <Tooltip
                    cursor={false}
                    content={() => null}
                  />
                  <ReferenceLine 
                    yAxisId="left"
                    y={0} 
                    stroke="#cbd5e1aa" 
                    strokeWidth={1} 
                    ifOverflow="extendDomain"
                  />
                  <Scatter 
                    yAxisId="left" 
                    data={visiblePoints} 
                    shape={dotShape} 
                    isAnimationActive={false}
                    onMouseEnter={(entry: any, _index: number, e: React.MouseEvent) => {
                      if (entry && 'inputTokens' in entry) {
                        commitHover(entry as ExplorePoint, e.clientX, e.clientY);
                      }
                    }}
                    onMouseLeave={clearHover}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              
              </div>
            </div>

            {/* X-axis range selector */}
            <div 
              className="relative mt-1 h-16 select-none"
              style={{ marginLeft: 132 , marginRight: 12 }}
            >
              <div 
                ref={xRangeContainerRef}
                className="relative h-10 w-full cursor-ew-resize overflow-visible rounded-lg bg-slate-950/40 ring-1 ring-slate-800/80 transition-colors"
                onMouseDown={handleXRangeMouseDown}
                onMouseLeave={() => !isXRangeDragging && setXRangeHover(null)}
                onDoubleClick={zoomDomain ? resetZoom : undefined}
              >
                {/* Background area chart */}
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart 
                    data={xDistribution} 
                    margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="xDistGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <XAxis type="number" dataKey="ts" domain={dataBounds?.x} hide />
                    <YAxis type="number" dataKey="tokens" hide domain={[0, 'dataMax']} />
                    <Area 
                      type="monotone" 
                      dataKey="tokens" 
                      stroke="#7cc5ff" 
                      strokeWidth={1.5}
                      strokeOpacity={0.8}
                      fill="url(#xDistGradient)" 
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>

                {/* Selection area mask and handles - always visible, covers full range by default */}
                {dataBounds && (() => {
                  const currentSelection = zoomDomain?.x ?? dataBounds.x;
                  const startRatio = (currentSelection[0] - dataBounds.x[0]) / (dataBounds.x[1] - dataBounds.x[0]);
                  const endRatio = (currentSelection[1] - dataBounds.x[0]) / (dataBounds.x[1] - dataBounds.x[0]);
                  const hasZoom = zoomDomain !== null;
                  const showLeftLabel = xRangeHover === 'left' || xRangeHover === 'box' || isXRangeDragging;
                  const showRightLabel = xRangeHover === 'right' || xRangeHover === 'box' || isXRangeDragging;
                  
                  return (
                    <>
                      {/* Left gray area */}
                      {startRatio > 0.001 && (
                        <div 
                          className="pointer-events-none absolute top-0 h-full rounded-l-lg bg-slate-950/55"
                          style={{
                            left: 0,
                            width: `${startRatio * 100}%`,
                          }}
                        />
                      )}
                      {/* Right gray area */}
                      {endRatio < 0.999 && (
                        <div 
                          className="pointer-events-none absolute top-0 h-full rounded-r-lg bg-slate-950/55"
                          style={{
                            left: `${endRatio * 100}%`,
                            right: 0,
                          }}
                        />
                      )}

                      {/* Selection box (draggable for moving) */}
                      <div 
                        className={`absolute top-0 h-full cursor-move border-y transition-[background-color,border-color] duration-150 hover:bg-blue-500/10 active:bg-blue-500/15 ${hasZoom ? 'border-blue-500/50 border-l border-r rounded-lg' : 'border-blue-500/25'}`}
                        style={{
                          left: `${startRatio * 100}%`,
                          width: `${(endRatio - startRatio) * 100}%`,
                        }}
                        onMouseEnter={() => setXRangeHover('box')}
                      />

                      {/* Left drag handle */}
                      <div 
                        className="group absolute top-0 z-10 flex h-full w-5 -translate-x-1/2 cursor-ew-resize items-center justify-center"
                        style={{ left: `${startRatio * 100}%` }}
                        onMouseEnter={() => setXRangeHover('left')}
                      >
                        <div className="h-6 w-1.5 rounded-full bg-slate-200/90 ring-1 ring-slate-950/80 shadow-none transition-[background-color,width] duration-150 group-hover:w-2 group-hover:bg-slate-50" />
                        {/* Time label - only show on hover or drag */}
                        <div className={`absolute bottom-full mb-1 whitespace-nowrap rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-200 ring-1 ring-slate-700/60 transition-opacity duration-150 ${showLeftLabel ? 'opacity-100' : 'opacity-0'}`}>
                          {formatTs(currentSelection[0])}
                        </div>
                      </div>

                      {/* Right drag handle */}
                      <div 
                        className="group absolute top-0 z-10 flex h-full w-5 -translate-x-1/2 cursor-ew-resize items-center justify-center"
                        style={{ left: `${endRatio * 100}%` }}
                        onMouseEnter={() => setXRangeHover('right')}
                      >
                        <div className="h-6 w-1.5 rounded-full bg-slate-200/90 ring-1 ring-slate-950/80 shadow-none transition-[background-color,width] duration-150 group-hover:w-2 group-hover:bg-slate-50" />
                        {/* Time label - only show on hover or drag */}
                        <div className={`absolute bottom-full mb-1 whitespace-nowrap rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-200 ring-1 ring-slate-700/60 transition-opacity duration-150 ${showRightLabel ? 'opacity-100' : 'opacity-0'}`}>
                          {formatTs(currentSelection[1])}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
            </>
          )}
        </div>
      </section>
      <ScatterTooltip ref={scatterTooltipRef} getModelColor={getModelColor} />
    </main>
  );
}
