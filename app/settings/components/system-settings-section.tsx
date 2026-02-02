"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Activity } from "lucide-react";
import { Modal } from "@/app/components/Modal";

const STATUS_TIMEOUT_MS = 8000;

type Props = {
  darkMode: boolean;
};

export function SystemSettingsSection({ darkMode }: Props) {
  const [usageStatsEnabled, setUsageStatsEnabled] = useState<boolean | null>(null);
  const [usageStatsLoading, setUsageStatsLoading] = useState(false);
  const [showUsageConfirm, setShowUsageConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorTimerRef = useRef<number | null>(null);

  const clearErrorTimer = () => {
    if (errorTimerRef.current !== null) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
  };

  const setErrorWithTimer = (message: string) => {
    clearErrorTimer();
    setError(message);
    errorTimerRef.current = window.setTimeout(() => {
      setError(null);
      errorTimerRef.current = null;
    }, STATUS_TIMEOUT_MS);
  };

  const loadToggle = useCallback(async () => {
    setUsageStatsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/usage-statistics-enabled", { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setUsageStatsEnabled(Boolean(data["usage-statistics-enabled"]));
    } catch {
      setUsageStatsEnabled(null);
      setErrorWithTimer("Failed to load settings, please refresh");
    } finally {
      setUsageStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadToggle();
  }, [loadToggle]);

  const applyUsageToggle = async (nextEnabled: boolean) => {
    setUsageStatsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/usage-statistics-enabled", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: nextEnabled })
      });
      if (!res.ok) throw new Error("toggle failed");
      const data = await res.json();
      setUsageStatsEnabled(Boolean(data["usage-statistics-enabled"]));
    } catch {
      setErrorWithTimer("Failed to update settings, please try again");
    } finally {
      setUsageStatsLoading(false);
    }
  };

  const handleUsageToggle = () => {
    if (usageStatsEnabled === null) return;
    const nextEnabled = !usageStatsEnabled;
    if (!nextEnabled) {
      setShowUsageConfirm(true);
      return;
    }
    applyUsageToggle(nextEnabled);
  };

  return (
    <>
      <section className={`mt-8 rounded-2xl p-6 shadow-sm ring-1 ${darkMode ? "bg-zinc-800/50 ring-zinc-700" : "bg-white ring-zinc-200"}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`text-lg font-semibold ${darkMode ? "text-white" : "text-zinc-900"}`}>System Settings</h2>
            <p className={`mt-1 text-xs ${darkMode ? "text-zinc-400" : "text-zinc-500"}`}>Configure upstream service settings</p>
          </div>
          {error && <p className="text-xs text-rose-400/80">{error}</p>}
        </div>

        <div className="mt-6">
          <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${darkMode ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-200 bg-zinc-50"}`}>
            <div className="flex items-center gap-3">
              <Activity className={`h-5 w-5 ${darkMode ? "text-zinc-400" : "text-zinc-500"}`} aria-hidden="true" />
              <div>
                <p className={`text-base font-medium ${darkMode ? "text-white" : "text-zinc-900"}`}>Upstream Usage Statistics</p>
                <p className={`text-sm ${darkMode ? "text-zinc-400" : "text-zinc-600"}`}>
                  Enable or disable CLIProxyAPI from recording usage data
                </p>
              </div>
            </div>
            <button
              onClick={handleUsageToggle}
              disabled={usageStatsLoading || usageStatsEnabled === null}
              aria-label={`${usageStatsEnabled ? "Disable" : "Enable"} upstream usage statistics`}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                usageStatsEnabled
                  ? "bg-emerald-600 text-white hover:bg-emerald-500"
                  : "border border-zinc-600 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
              } ${usageStatsLoading ? "opacity-70" : ""}`}
            >
              {usageStatsLoading ? "..." : usageStatsEnabled ? "ON" : "OFF"}
            </button>
          </div>
        </div>
      </section>

      {/* Usage Stats Confirmation Modal */}
      <Modal
        isOpen={showUsageConfirm}
        onClose={() => setShowUsageConfirm(false)}
        title="Disable Upstream Usage Statistics?"
        darkMode={darkMode}
      >
        <p className={`mt-2 text-sm ${darkMode ? "text-zinc-400" : "text-zinc-600"}`}>
          This will stop CLIProxyAPI from recording usage data. You can re-enable it when needed.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setShowUsageConfirm(false)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${darkMode ? "border-zinc-600 text-zinc-200 hover:bg-zinc-800" : "border-zinc-300 text-zinc-700 hover:bg-zinc-100"}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setShowUsageConfirm(false);
              applyUsageToggle(false);
            }}
            className="flex-1 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
            disabled={usageStatsLoading}
          >
            Confirm Disable
          </button>
        </div>
      </Modal>
    </>
  );
}
