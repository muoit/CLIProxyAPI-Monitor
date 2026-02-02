"use client";

import { Pencil, Trash2 } from "lucide-react";
import type { ModelPrice } from "@/lib/types";

type Props = {
  prices: ModelPrice[];
  darkMode: boolean;
  onEdit: (price: ModelPrice) => void;
  onDelete: (model: string) => void;
};

export function ModelPriceList({ prices, darkMode, onEdit, onDelete }: Props) {
  if (!prices.length) {
    return (
      <div className={`flex flex-col items-center justify-center rounded-xl border border-dashed py-8 text-center ${darkMode ? "border-zinc-700 bg-zinc-800/30" : "border-zinc-300 bg-zinc-50"}`}>
        <p className="text-base text-zinc-400">No configured prices</p>
      </div>
    );
  }

  return (
    <div className="scrollbar-slim grid max-h-[400px] gap-3 overflow-y-auto pr-1">
      {prices.map((price) => (
        <div key={price.model} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${darkMode ? "border-zinc-700 bg-zinc-800/50" : "border-zinc-200 bg-zinc-50"}`}>
          <div>
            <p className={`text-base font-semibold ${darkMode ? "text-white" : "text-zinc-900"}`}>{price.model}</p>
            <p className={`text-sm ${darkMode ? "text-zinc-400" : "text-zinc-600"}`}>
              ${price.inputPricePer1M}/M Input
              {price.cachedInputPricePer1M > 0 && ` • $${price.cachedInputPricePer1M}/M Cached`}
              {" • "}${price.outputPricePer1M}/M Output
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onEdit(price)}
              className={`rounded-lg p-2 transition ${darkMode ? "text-zinc-400 hover:bg-zinc-700 hover:text-white" : "text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"}`}
              title="Edit"
              aria-label={`Edit ${price.model} price`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(price.model)}
              className={`rounded-lg p-2 transition ${darkMode ? "text-rose-400/80 hover:bg-rose-900/50 hover:text-rose-300" : "text-rose-500 hover:bg-rose-100 hover:text-rose-700"}`}
              title="Delete"
              aria-label={`Delete ${price.model} price`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
