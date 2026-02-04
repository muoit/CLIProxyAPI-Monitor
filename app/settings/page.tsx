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
    <main className={`min-h-screen px-6 py-8 transition-colors ${darkMode ? "bg-[#1e1e1e] text-[#E8E0D6]" : "bg-[#FAF9F6] text-[#2A2520]"}`}>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className={`text-2xl font-bold ${darkMode ? "text-[#E8E0D6]" : "text-[#2A2520]"}`}>Settings</h1>
        <p className={`mt-1 text-sm ${darkMode ? "text-[#A39888]" : "text-[#7A7068]"}`}>
          Configure model pricing and system settings
        </p>
      </div>

      <SettingsErrorBoundary darkMode={darkMode}>
        {loading ? (
          <div className={`rounded-2xl p-6 shadow-sm ring-1 ${darkMode ? "bg-[#2a2a2a]/50 ring-[#3d3d3d]" : "bg-[#F0EBE4] ring-[#D4CCC2]"}`}>
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#DA7756] border-t-transparent" />
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
