import { useCallback, useRef, useState, type ReactNode } from "react";
import { Check, AlertTriangle, Info, X } from "lucide-react";
import { ToastContext, type ToastTone } from "@/components/ui/use-toast";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
  duration?: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const push = useCallback((toast: Omit<Toast, "id">) => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { ...toast, id }]);
    const duration = toast.duration ?? 3500;
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);
  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto flex w-full max-w-sm flex-col items-center gap-2 px-4"
      >
        {items.map((toast) => (
          <div
            key={toast.id}
            className={[
              "pointer-events-auto flex w-full items-start gap-3 rounded-2xl border bg-bg/95 p-3",
              "shadow-[0_18px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur",
              "transition-all duration-200 ease-out",
              toast.tone === "success" ? "border-primary/50" : toast.tone === "error" ? "border-primary/50" : "border-border",
            ].join(" ")}
          >
            <span className="mt-0.5 shrink-0 text-primary">
              {toast.tone === "success" ? <Check className="size-4" /> : toast.tone === "error" ? <AlertTriangle className="size-4" /> : <Info className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-tight">{toast.title}</p>
              {toast.body ? <p className="mt-0.5 text-xs leading-snug text-muted">{toast.body}</p> : null}
            </div>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => dismiss(toast.id)}
              className="press flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

