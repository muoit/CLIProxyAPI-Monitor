"use client";

import { useState, useEffect, useRef, useMemo, startTransition, useCallback } from "react";
import { X } from "lucide-react";

type ComboBoxProps = {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  darkMode: boolean;
  className?: string;
  onSelectOption?: (val: string) => void;
  onClear?: () => void;
};

export function ComboBox({
  value,
  onChange,
  options,
  placeholder,
  darkMode,
  className,
  onSelectOption,
  onClear
}: ComboBoxProps) {
  const [open, setOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [hasTyped, setHasTyped] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    if (!hasTyped) return options;
    return options.filter((opt) => opt.toLowerCase().includes(value.toLowerCase()));
  }, [hasTyped, options, value]);

  const baseInput = `${className ?? ""} rounded-lg border px-3 py-2 text-sm focus:border-[#DA7756] focus:outline-none ${
    darkMode ? "border-[#3d3d3d] bg-[#1e1e1e] text-[#E8E0D6] placeholder-[#8A7F72]" : "border-[#D4CCC2] bg-[#F0EBE4] text-[#2A2520] placeholder-[#A39888]"
  }`;

  const closeDropdown = useCallback(() => {
    setIsClosing(true);
    setHighlightedIndex(-1);
    setTimeout(() => {
      setOpen(false);
      setIsVisible(false);
      setIsClosing(false);
    }, 100);
  }, []);

  const selectOption = useCallback((opt: string) => {
    onChange(opt);
    setHasTyped(false);
    closeDropdown();
    inputRef.current?.blur();
    onSelectOption?.(opt);
  }, [onChange, closeDropdown, onSelectOption]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isVisible || filtered.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filtered.length) {
          selectOption(filtered[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        closeDropdown();
        break;
      case "Tab":
        closeDropdown();
        break;
    }
  }, [isVisible, filtered, highlightedIndex, selectOption, closeDropdown]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  // Reset highlighted index when filtered changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [filtered]);

  useEffect(() => {
    if (open) {
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
  }, [open, closeDropdown]);

  return (
    <div className="relative" ref={containerRef} role="combobox" aria-expanded={isVisible} aria-haspopup="listbox">
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
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`${baseInput} pr-8 w-full`}
        aria-autocomplete="list"
        aria-controls="combobox-listbox"
        aria-activedescendant={highlightedIndex >= 0 ? `option-${highlightedIndex}` : undefined}
      />
      {value && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange("");
            setHasTyped(false);
            onClear?.();
          }}
          className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 transition ${
            darkMode ? "text-[#A39888] hover:bg-[#333333] hover:text-[#D4CCC2]" : "text-[#8A7F72] hover:bg-[#D4CCC2] hover:text-[#3d3d3d]"
          }`}
          title="Clear"
          aria-label="Clear input"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {isVisible && filtered.length > 0 ? (
        <div
          ref={listRef}
          id="combobox-listbox"
          role="listbox"
          className={`absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border shadow-lg scrollbar-slim ${
            darkMode ? "border-[#3d3d3d] bg-[#1e1e1e]" : "border-[#D4CCC2] bg-[#F0EBE4]"
          } ${isClosing ? "animate-dropdown-out" : "animate-dropdown-in"}`}
        >
          {filtered.map((opt, idx) => (
            <button
              type="button"
              key={opt}
              id={`option-${idx}`}
              role="option"
              aria-selected={highlightedIndex === idx}
              onMouseDown={(e) => {
                e.preventDefault();
                selectOption(opt);
              }}
              onMouseEnter={() => setHighlightedIndex(idx)}
              className={`block w-full px-3 py-2 text-left text-sm transition ${
                highlightedIndex === idx
                  ? darkMode ? "bg-[#2a2a2a] text-[#E8E0D6]" : "bg-[#E8E0D6] text-[#2A2520]"
                  : darkMode ? "text-[#D4CCC2] hover:bg-[#2a2a2a]" : "text-[#3d3d3d] hover:bg-[#E8E0D6]"
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
