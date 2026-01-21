"use client";

import { useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { ComboBox } from "@/app/components/ComboBox";

export type PriceFormData = {
  model: string;
  inputPricePer1M: string;
  cachedInputPricePer1M: string;
  outputPricePer1M: string;
};

type Props = {
  darkMode: boolean;
  modelOptions: string[];
  onSubmit: (data: PriceFormData) => Promise<{ success: boolean; error?: string }>;
};

export function ModelPriceForm({ darkMode, modelOptions, onSubmit }: Props) {
  const [form, setForm] = useState<PriceFormData>({
    model: "",
    inputPricePer1M: "",
    cachedInputPricePer1M: "",
    outputPricePer1M: ""
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setSaving(true);

    const result = await onSubmit(form);

    if (result.success) {
      setForm({ model: "", inputPricePer1M: "", cachedInputPricePer1M: "", outputPricePer1M: "" });
      setStatus("Saved");
    } else {
      setStatus(result.error || "Save failed");
    }

    setSaving(false);
    setTimeout(() => setStatus(null), 8000);
  };

  const inputClass = `mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none ${
    darkMode ? "border-slate-700 bg-slate-900 text-white placeholder-slate-500" : "border-slate-300 bg-white text-slate-900 placeholder-slate-400"
  }`;

  return (
    <form onSubmit={handleSubmit} className={`rounded-xl border p-5 lg:col-span-2 ${darkMode ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-slate-50"}`}>
      <div className="grid gap-4">
        <label className={`text-sm font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
          Model Name
          <ComboBox
            value={form.model}
            onChange={(val) => setForm((f) => ({ ...f, model: val }))}
            options={modelOptions}
            placeholder="gpt-4o (Supports wildcards like gemini-2*)"
            darkMode={darkMode}
            className="mt-1"
          />
        </label>
        <label className={`text-sm font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
          Input ($ / M tokens)
          <input
            type="number"
            step="0.01"
            className={inputClass}
            placeholder="2.5"
            value={form.inputPricePer1M}
            onChange={(e) => setForm((f) => ({ ...f, inputPricePer1M: e.target.value }))}
          />
        </label>
        <label className={`text-sm font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
          CachedInput ($ / M tokens)
          <input
            type="number"
            step="0.01"
            className={inputClass}
            placeholder="0.5 (Optional, defaults to 0)"
            value={form.cachedInputPricePer1M}
            onChange={(e) => setForm((f) => ({ ...f, cachedInputPricePer1M: e.target.value }))}
          />
        </label>
        <label className={`text-sm font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
          Output ($ / M tokens)
          <input
            type="number"
            step="0.01"
            className={inputClass}
            placeholder="10"
            value={form.outputPricePer1M}
            onChange={(e) => setForm((f) => ({ ...f, outputPricePer1M: e.target.value }))}
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-60"
        >
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving..." : "Save Price"}
        </button>
        {status && (
          <p className={`text-xs ${status === "Saved" ? "text-emerald-400" : "text-red-400"}`}>
            {status}
          </p>
        )}
      </div>
    </form>
  );
}
