"use client";

import { useEffect, useState } from "react";
import type { ModelPrice } from "@/lib/types";
import { ModelPriceSection } from "./components/model-price-section";
import { SystemSettingsSection } from "./components/system-settings-section";
import { SettingsErrorBoundary } from "./components/settings-error-boundary";

export default function SettingsPage() {
  const [darkMode, setDarkMode] = useState(true);
  const [prices, setPrices] = useState<ModelPrice[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Theme detection
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light") setDarkMode(false);
    else if (saved === "dark") setDarkMode(true);
    else setDarkMode(window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  // Load prices and model options
  useEffect(() => {
    const load = async () => {
      try {
        // Fetch prices and overview in parallel
        const [pricesRes, overviewRes] = await Promise.all([
          fetch("/api/prices", { cache: "no-store" }),
          fetch("/api/overview?days=7&pageSize=100", { cache: "no-store" })
        ]);

        if (pricesRes.ok) {
          const data: ModelPrice[] = await pricesRes.json();
          setPrices(
            data.map((p) => ({
              model: p.model,
              inputPricePer1M: Number(p.inputPricePer1M),
              cachedInputPricePer1M: Number(p.cachedInputPricePer1M),
              outputPricePer1M: Number(p.outputPricePer1M)
            }))
          );
        }

        if (overviewRes.ok) {
          const overviewData = await overviewRes.json();
          // Extract model names from overview filters and models
          const models = new Set<string>();
          overviewData.filters?.models?.forEach((m: string) => models.add(m));
          overviewData.overview?.models?.forEach((m: { model: string }) => models.add(m.model));
          setModelOptions(Array.from(models));
        }
      } catch (err) {
        console.warn("Failed to load data", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <main className={`min-h-screen px-6 py-8 transition-colors ${darkMode ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"}`}>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className={`text-2xl font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>Settings</h1>
        <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
          Configure model pricing and system settings
        </p>
      </div>

      <SettingsErrorBoundary darkMode={darkMode}>
        {loading ? (
          <div className={`rounded-2xl p-6 shadow-sm ring-1 ${darkMode ? "bg-slate-800/50 ring-slate-700" : "bg-white ring-slate-200"}`}>
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
            </div>
          </div>
        ) : (
          <ModelPriceSection
            prices={prices}
            onPricesChange={setPrices}
            darkMode={darkMode}
            modelOptions={modelOptions}
          />
        )}

        <SystemSettingsSection darkMode={darkMode} />
      </SettingsErrorBoundary>
    </main>
  );
}
