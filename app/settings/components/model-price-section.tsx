"use client";

import { useState, useMemo } from "react";
import type { ModelPrice } from "@/lib/types";
import { Modal } from "@/app/components/Modal";
import { ModelPriceForm, type PriceFormData } from "./model-price-form";
import { ModelPriceList } from "./model-price-list";

// Sanitize model name to prevent XSS
function sanitizeModelName(name: string): string {
  return name
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .trim()
    .slice(0, 100);
}

type Props = {
  prices: ModelPrice[];
  onPricesChange: (prices: ModelPrice[]) => void;
  darkMode: boolean;
  modelOptions?: string[];
};

export function ModelPriceSection({ prices, onPricesChange, darkMode, modelOptions = [] }: Props) {
  const [editingPrice, setEditingPrice] = useState<ModelPrice | null>(null);
  const [editForm, setEditForm] = useState<PriceFormData>({ model: "", inputPricePer1M: "", cachedInputPricePer1M: "", outputPricePer1M: "" });
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<string | null>(null);

  const priceModelOptions = useMemo(() => {
    const names = new Set<string>();
    modelOptions.forEach((m) => names.add(m));
    prices.forEach((p) => names.add(p.model));
    return Array.from(names).sort();
  }, [modelOptions, prices]);

  const handleFormSubmit = async (form: PriceFormData): Promise<{ success: boolean; error?: string }> => {
    const modelName = sanitizeModelName(form.model);
    const inputPrice = Number(form.inputPricePer1M);
    const outputPrice = Number(form.outputPricePer1M);

    if (!modelName) return { success: false, error: "Model name is required" };
    if (Number.isNaN(inputPrice) || inputPrice < 0) return { success: false, error: "Input price must be valid" };
    if (Number.isNaN(outputPrice) || outputPrice < 0) return { success: false, error: "Output price must be valid" };

    const payload = {
      model: modelName,
      inputPricePer1M: inputPrice,
      cachedInputPricePer1M: Number(form.cachedInputPricePer1M) || 0,
      outputPricePer1M: outputPrice
    };

    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) return { success: false, error: "Save failed" };

      const updated = prices.filter((p) => p.model !== payload.model);
      onPricesChange([...updated, payload].sort((a, b) => a.model.localeCompare(b.model)));
      return { success: true };
    } catch {
      return { success: false, error: "Request failed" };
    }
  };

  const handleDelete = async (model: string) => {
    try {
      const res = await fetch("/api/prices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model })
      });
      if (res.ok) onPricesChange(prices.filter((p) => p.model !== model));
    } catch {
      // Silent fail for delete
    }
  };

  const openEditModal = (price: ModelPrice) => {
    setEditingPrice(price);
    setEditForm({
      model: price.model,
      inputPricePer1M: String(price.inputPricePer1M),
      cachedInputPricePer1M: String(price.cachedInputPricePer1M || 0),
      outputPricePer1M: String(price.outputPricePer1M)
    });
    setEditStatus(null);
  };

  const handleEditSave = async () => {
    if (!editingPrice) return;
    const payload = {
      model: sanitizeModelName(editForm.model),
      inputPricePer1M: Number(editForm.inputPricePer1M),
      cachedInputPricePer1M: Number(editForm.cachedInputPricePer1M) || 0,
      outputPricePer1M: Number(editForm.outputPricePer1M)
    };

    if (!payload.model) {
      setEditStatus("Model name is required");
      return;
    }

    try {
      if (editingPrice.model !== payload.model) {
        const delRes = await fetch("/api/prices", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: editingPrice.model })
        });
        if (!delRes.ok) {
          setEditStatus("Failed to update");
          return;
        }
      }

      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const updated = prices.filter((p) => p.model !== editingPrice.model && p.model !== payload.model);
        onPricesChange([...updated, payload].sort((a, b) => a.model.localeCompare(b.model)));
        setEditingPrice(null);
      } else {
        setEditStatus("Save failed");
      }
    } catch {
      setEditStatus("Request failed");
    }
  };

  const inputClass = `mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none ${
    darkMode ? "border-zinc-700 bg-zinc-900 text-white placeholder-zinc-500" : "border-zinc-300 bg-white text-zinc-900 placeholder-zinc-400"
  }`;

  return (
    <>
      <section className={`rounded-2xl p-6 shadow-sm ring-1 ${darkMode ? "bg-zinc-800/50 ring-zinc-700" : "bg-white ring-zinc-200"}`}>
        <div className="mb-6">
          <h2 className={`text-lg font-semibold ${darkMode ? "text-white" : "text-zinc-900"}`}>Model Price Configuration</h2>
          <p className={`text-xs ${darkMode ? "text-zinc-400" : "text-zinc-500"}`}>Set price per million tokens, cost calculation will update immediately</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <ModelPriceForm darkMode={darkMode} modelOptions={priceModelOptions} onSubmit={handleFormSubmit} />
          <div className="lg:col-span-3">
            <ModelPriceList prices={prices} darkMode={darkMode} onEdit={openEditModal} onDelete={(m) => setPendingDelete(m)} />
          </div>
        </div>
      </section>

      {/* Edit Modal */}
      <Modal isOpen={!!editingPrice} onClose={() => setEditingPrice(null)} title="Edit Price" darkMode={darkMode}>
        <div className="mt-4 grid gap-3">
          <label className={`text-sm font-medium ${darkMode ? "text-zinc-300" : "text-zinc-700"}`}>
            Model Name
            <input type="text" className={inputClass} value={editForm.model} onChange={(e) => setEditForm((f) => ({ ...f, model: e.target.value }))} />
          </label>
          <label className={`text-sm font-medium ${darkMode ? "text-zinc-300" : "text-zinc-700"}`}>
            Input ($ / M tokens)
            <input type="number" step="0.01" className={inputClass} value={editForm.inputPricePer1M} onChange={(e) => setEditForm((f) => ({ ...f, inputPricePer1M: e.target.value }))} />
          </label>
          <label className={`text-sm font-medium ${darkMode ? "text-zinc-300" : "text-zinc-700"}`}>
            CachedInput ($ / M tokens)
            <input type="number" step="0.01" className={inputClass} value={editForm.cachedInputPricePer1M} onChange={(e) => setEditForm((f) => ({ ...f, cachedInputPricePer1M: e.target.value }))} />
          </label>
          <label className={`text-sm font-medium ${darkMode ? "text-zinc-300" : "text-zinc-700"}`}>
            Output ($ / M tokens)
            <input type="number" step="0.01" className={inputClass} value={editForm.outputPricePer1M} onChange={(e) => setEditForm((f) => ({ ...f, outputPricePer1M: e.target.value }))} />
          </label>
          {editStatus && <p className="text-xs text-rose-400/80">{editStatus}</p>}
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setEditingPrice(null)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${darkMode ? "border-zinc-600 text-zinc-300 hover:bg-zinc-700" : "border-zinc-300 text-zinc-700 hover:bg-zinc-100"}`}>Cancel</button>
            <button type="button" onClick={handleEditSave} className="flex-1 rounded-lg bg-indigo-500/80 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400">Save</button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={!!pendingDelete} onClose={() => setPendingDelete(null)} title="Confirm Delete" darkMode={darkMode}>
        <p className={`mt-2 text-sm ${darkMode ? "text-zinc-300" : "text-zinc-600"}`}>Delete model {pendingDelete}&apos;s price configuration?</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => setPendingDelete(null)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${darkMode ? "border-zinc-600 text-zinc-300 hover:bg-zinc-700" : "border-zinc-300 text-zinc-700 hover:bg-zinc-100"}`}>Cancel</button>
          <button type="button" onClick={() => { handleDelete(pendingDelete!); setPendingDelete(null); }} className="flex-1 rounded-lg border border-rose-400/80 px-3 py-2 text-sm font-semibold text-rose-400/80 transition hover:bg-rose-500/10">Delete</button>
        </div>
      </Modal>
    </>
  );
}
