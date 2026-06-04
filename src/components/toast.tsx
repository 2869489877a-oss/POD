"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import { useSettings } from "@/lib/settings/context";

type ToastType = "success" | "error" | "info";

type Toast = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
};

const TOAST_DURATION = 4000;

const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), TOAST_DURATION);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastViewport toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

const TYPE_STYLES: Record<ToastType, { color: string; icon: ReactNode }> = {
  success: {
    color: "#10b981",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    ),
  },
  error: {
    color: "#ef4444",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
    ),
  },
  info: {
    color: "#0ea5e9",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
    ),
  },
};

function ToastViewport({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
  const { isDark } = useSettings();

  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-3"
      role="region"
      aria-live="polite"
      aria-label="通知"
    >
      {toasts.map((toast) => {
        const style = TYPE_STYLES[toast.type];
        return (
          <div
            key={toast.id}
            className={[
              "animate-toast-in pointer-events-auto relative flex w-[320px] max-w-[86vw] items-start gap-3 overflow-hidden rounded-2xl border px-4 py-3.5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl",
              isDark ? "border-white/10 bg-slate-900/85 text-slate-100" : "border-black/[0.06] bg-white/90 text-slate-800",
            ].join(" ")}
          >
            {/* Left accent bar */}
            <span className="absolute inset-y-0 left-0 w-1" style={{ background: style.color }} />

            {/* Icon chip */}
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `${style.color}1f`, color: style.color }}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                {style.icon}
              </svg>
            </span>

            <span className="min-w-0 flex-1 break-words pt-0.5 text-sm font-medium leading-snug">
              {toast.message}
            </span>

            <button
              onClick={() => removeToast(toast.id)}
              aria-label="关闭"
              className={`-mr-1 mt-0.5 shrink-0 rounded-md p-0.5 transition-opacity ${isDark ? "text-slate-400 hover:text-white" : "text-slate-400 hover:text-slate-700"}`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Auto-dismiss progress bar */}
            <span
              className="absolute bottom-0 left-0 h-[3px] w-full origin-left"
              style={{
                background: `linear-gradient(90deg, ${style.color}, ${style.color}66)`,
                animation: `toast-progress ${TOAST_DURATION}ms linear forwards`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
