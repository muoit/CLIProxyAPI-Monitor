"use client";

import { startTransition, useEffect, useState } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  className?: string;
  backdropClassName?: string;
  darkMode?: boolean;
}

export function Modal({ 
  isOpen, 
  onClose, 
  children, 
  title, 
  className, 
  backdropClassName,
  darkMode = true 
}: ModalProps) {
  const [isVisible, setIsVisible] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const [cachedChildren, setCachedChildren] = useState<React.ReactNode>(isOpen ? children : null);
  const [cachedTitle, setCachedTitle] = useState<string | undefined>(isOpen ? title : undefined);

  // Handle visibility transitions and initial sync
  useEffect(() => {
    if (isOpen) {
      startTransition(() => {
        setIsVisible(true);
        setIsClosing(false);
        setCachedChildren(children);
        setCachedTitle(title);
      });
    } else if (isVisible && !isClosing) {
      // Start closing animation if we are currently visible and not already closing
      startTransition(() => setIsClosing(true));
    }
  }, [isOpen, isVisible, isClosing, children, title]);

  useEffect(() => {
    if (isClosing) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsClosing(false);
        setCachedChildren(null);
        setCachedTitle(undefined);
      }, 200); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [isClosing]);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm transition-all ${
        backdropClassName ?? "bg-black/50"
      } ${
        isClosing ? "animate-modal-backdrop-out" : "animate-modal-backdrop"
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative w-full rounded-2xl p-6 shadow-xl ${
          darkMode ? "bg-[#2a2a2a]" : "bg-[#F0EBE4]"
        } ${className ?? "max-w-md"} ${
          isClosing ? "animate-modal-content-out" : "animate-modal-content"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          className={`absolute right-4 top-4 rounded-lg p-1 transition ${
            darkMode
              ? "text-[#A39888] hover:bg-[#333333] hover:text-[#E8E0D6]"
              : "text-[#8A7F72] hover:bg-[#D4CCC2] hover:text-[#2A2520]"
          }`}
        >
          <X className="h-5 w-5" />
        </button>
        {(isOpen ? title : cachedTitle) && (
          <h3 className={`text-lg font-semibold ${darkMode ? "text-[#E8E0D6]" : "text-[#2A2520]"}`}>
            {isOpen ? title : cachedTitle}
          </h3>
        )}
        {isOpen ? children : cachedChildren}
      </div>
    </div>
  );
}
