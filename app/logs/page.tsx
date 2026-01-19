"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type LogsResponse = {
  lines?: string[];
  "line-count"?: number;
  "latest-timestamp"?: number;
};

type ErrorLogEntry = {
  name: string;
  size?: number;
  modified?: number;
};

type FetchMode = "full" | "incremental";

// Format Unix timestamp to human-readable time (Asia/Shanghai timezone)
function formatTimestamp(ts: number | undefined): string {
  if (!ts) return "";
  const date = new Date(ts * 1000);
  return date.toLocaleString("en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  });
}

// Format file size
function formatSize(bytes: number | undefined): string {
  if (!bytes) return "? bytes";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-700/50 ${className ?? ""}`} />;
}

export default function LogsPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [latestTs, setLatestTs] = useState<number | null>(null);
  const [afterInput, setAfterInput] = useState("");
  const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>([]);
  const [errorLogContent, setErrorLogContent] = useState<string | null>(null);
  const [errorLogName, setErrorLogName] = useState<string | null>(null);
  const [errorLogLoading, setErrorLogLoading] = useState(false);
  const [errorLogError, setErrorLogError] = useState<string | null>(null);
  const [errorLogContentLoading, setErrorLogContentLoading] = useState(false);
  const [hideManagement, setHideManagement] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = window.localStorage.getItem("hideManagement");
    return saved === "true";
  });

  // Sort errorLogs in reverse chronological order
  const sortedErrorLogs = useMemo(() => {
    return [...errorLogs].sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
  }, [errorLogs]);

  // Save hideManagement state to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("hideManagement", String(hideManagement));
    }
  }, [hideManagement]);

  const latestText = useMemo(() => {
    if (!latestTs) return "None";
    const date = new Date(latestTs * 1000);
    return date.toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  }, [latestTs]);

  // Convert date-time string to Unix timestamp
  const parseDateTime = (value: string): number | null => {
    if (!value) return null;
    // If pure number, treat as timestamp
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    // Try parsing date-time
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
  };

  // Get date-time input value for display
  const getDateTimeInputValue = (): string => {
    if (!afterInput) return "";
    // If timestamp, convert to datetime-local format
    if (/^\d+$/.test(afterInput)) {
      const date = new Date(parseInt(afterInput, 10) * 1000);
      // Format: YYYY-MM-DDTHH:mm
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    return afterInput;
  };

  const handleDateTimeChange = (value: string) => {
    if (!value) {
      setAfterInput("");
      return;
    }
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      setAfterInput(String(Math.floor(date.getTime() / 1000)));
    }
  };

  const fetchLogs = useCallback(async (mode: FetchMode) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const afterVal = mode === "incremental" ? afterInput || (latestTs ? String(latestTs) : "") : afterInput;
      if (afterVal) params.set("after", afterVal);

      const res = await fetch(`/api/logs${params.toString() ? `?${params.toString()}` : ""}`, { cache: "no-store" });
      const data: LogsResponse & { error?: string } = await res.json();
      
      if (!res.ok) {
        // Handle specific errors
        if (data.error === "logging to file disabled") {
          setError("File logging not enabled. Enable logging-to-file in CLIProxy config");
        } else {
          setError(data.error || res.statusText);
        }
        setLines([]);
        return;
      }
      
      setLines(data.lines ?? []);
      setLatestTs(typeof data["latest-timestamp"] === "number" ? data["latest-timestamp"] : null);
    } catch (err) {
      setError((err as Error).message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [afterInput, latestTs]);

  const fetchErrorLogs = useCallback(async () => {
    setErrorLogLoading(true);
    setErrorLogError(null);
    try {
      const res = await fetch("/api/request-error-logs", { cache: "no-store" });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      setErrorLogs(Array.isArray(data?.files) ? data.files : []);
    } catch (err) {
      setErrorLogError((err as Error).message || "Failed to load");
    } finally {
      setErrorLogLoading(false);
    }
  }, []);

  const fetchErrorLogFile = useCallback(async (name: string) => {
    setErrorLogContentLoading(true);
    setErrorLogError(null);
    setErrorLogContent(null);
    try {
      const res = await fetch(`/api/request-error-logs?name=${encodeURIComponent(name)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(res.statusText);
      const text = await res.text();
      setErrorLogName(name);
      setErrorLogContent(text);
    } catch (err) {
      setErrorLogError((err as Error).message || "Failed to load");
    } finally {
      setErrorLogContentLoading(false);
    }
  }, []);

  // Initial load: default to loading logs from last 1 hour
  useEffect(() => {
    const timestamp = String(Math.floor(Date.now() / 1000 - 3600)); // 1 hour ago
    setAfterInput(timestamp);
    setLoading(true);
    setError(null);
    fetch(`/api/logs?after=${timestamp}`, { cache: "no-store" })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          if (data.error === "logging to file disabled") {
            setError("File logging not enabled. Enable logging-to-file in CLIProxy config");
          } else {
            setError(data.error);
          }
          setLines([]);
        } else {
          setLines(data.lines ?? []);
          setLatestTs(typeof data["latest-timestamp"] === "number" ? data["latest-timestamp"] : null);
        }
      })
      .catch(err => setError(err.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  // Automatically reload when time filter changes
  useEffect(() => {
    if (afterInput) {
      fetchLogs("full");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [afterInput]);

  useEffect(() => {
    fetchErrorLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen bg-slate-900 px-6 py-8 text-slate-100">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Logs</h1>
          <p className="text-base text-slate-400">Showing latest /logs output, not persisted</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <button
            onClick={() => fetchLogs("full")}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-semibold hover:border-slate-500"
            title="Reload all logs (filterable by start time)"
          >
            Reload
          </button>
          <button
            onClick={() => fetchLogs("incremental")}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-semibold hover:border-slate-500"
            title="Get only new logs after last record"
          >
            Get latest logs
          </button>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
        <label className="flex items-center gap-2">
          <span>Start time</span>
          <input
            type="datetime-local"
            value={getDateTimeInputValue()}
            onChange={(e) => handleDateTimeChange(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
          {afterInput && (
            <button
              onClick={() => setAfterInput("")}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs hover:border-slate-500"
              title="Clear"
            >
              Clear
            </button>
          )}
        </label>
        <span className="text-slate-400">|</span>
        <span>Latest record: {latestText}</span>
        <span className="text-slate-400">|</span>
        <div className="flex items-center gap-2">
          {[1, 6, 24].map((hours) => {
            // Calculate timestamp for current button
            const buttonTimestamp = String(Math.floor(Date.now() / 1000 - hours * 3600));
            // Check if close to currently selected time (allow 60s margin)
            const isActive = afterInput && Math.abs(parseInt(afterInput, 10) - parseInt(buttonTimestamp, 10)) < 60;
            
            return (
              <button
                key={hours}
                onClick={() => {
                  const timestamp = String(Math.floor(Date.now() / 1000 - hours * 3600));
                  setAfterInput(timestamp);
                  // Auto load logs
                  setLoading(true);
                  setError(null);
                  fetch(`/api/logs?after=${timestamp}`, { cache: "no-store" })
                    .then(res => res.json())
                    .then(data => {
                      if (data.error) {
                        if (data.error === "logging to file disabled") {
                          setError("File logging not enabled. Enable logging-to-file in CLIProxy config");
                        } else {
                          setError(data.error);
                        }
                        setLines([]);
                      } else {
                        setLines(data.lines ?? []);
                        setLatestTs(typeof data["latest-timestamp"] === "number" ? data["latest-timestamp"] : null);
                      }
                    })
                    .catch(err => setError(err.message || "Failed to load"))
                    .finally(() => setLoading(false));
                }}
                className={`rounded-lg border px-3 py-1.5 font-semibold transition ${
                  isActive
                    ? 'border-blue-500 bg-blue-600 text-white'
                    : 'border-slate-700 bg-slate-800 hover:border-slate-500'
                }`}
              >
                Last {hours}h
              </button>
            );
          })}
        </div>
        <span className="text-slate-400">|</span>
        <label className="flex cursor-pointer items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={hideManagement}
            onClick={() => setHideManagement(!hideManagement)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
              hideManagement ? 'bg-blue-500' : 'bg-slate-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                hideManagement ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span>Hide /v0/management</span>
        </label>
      </div>

      <section className="mt-4 rounded-2xl bg-slate-800/50 p-4 shadow-sm ring-1 ring-slate-700">
        {error ? <p className="text-base text-red-400">{error}</p> : null}
        {loading ? (
          <Skeleton className="h-40" />
        ) : lines.length === 0 ? (
          <p className="text-base text-slate-400">No logs found. Check if file logging is enabled</p>
        ) : (
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900/80 p-4 text-sm text-slate-100">
            {lines
              .filter(line => !hideManagement || !line.includes('/v0/management'))
              .join("\n")}
          </pre>
        )}
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-slate-800/50 p-4 shadow-sm ring-1 ring-slate-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">request-error-logs</h2>
            <button
              onClick={fetchErrorLogs}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-semibold hover:border-slate-500"
            >
              Refresh list
            </button>
          </div>
          {errorLogError ? <p className="mt-2 text-sm text-red-400">{errorLogError}</p> : null}
          {errorLogLoading ? (
            <Skeleton className="mt-3 h-24" />
          ) : errorLogs.length === 0 ? (
            <p className="mt-3 text-base text-slate-400">No error log files</p>
          ) : (
            <div className="mt-3 max-h-96 overflow-y-auto divide-y divide-slate-700">
              {sortedErrorLogs.map((file) => (
                <div key={file.name} className="flex items-start gap-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-white break-words">{file.name}</p>
                    <p className="text-sm text-slate-400">{formatSize(file.size)} • {formatTimestamp(file.modified)}</p>
                  </div>
                  <button
                    onClick={() => fetchErrorLogFile(file.name)}
                    className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-semibold hover:border-slate-500"
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-slate-800/50 p-4 shadow-sm ring-1 ring-slate-700">
          <div className="flex items-center justify-between gap-3">
            <h2 className="shrink-0 text-lg font-semibold text-white">Error log content</h2>
            {errorLogName ? <span className="min-w-0 truncate text-sm text-slate-400" title={errorLogName}>{errorLogName}</span> : null}
          </div>
          {errorLogContentLoading ? (
            <Skeleton className="mt-3 h-32" />
          ) : errorLogContent ? (
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900/80 p-4 text-sm text-slate-100">
              {errorLogContent}
            </pre>
          ) : (
            <p className="mt-3 text-base text-slate-400">Select a file to view</p>
          )}
        </div>
      </section>
    </main>
  );
}
