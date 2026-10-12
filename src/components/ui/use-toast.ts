import { createContext, useContext, useEffect, type ReactNode } from "react";

export type ToastTone = "info" | "success" | "error";

export interface ToastInput {
  tone: ToastTone;
  title: string;
  body?: string;
  duration?: number;
}

export interface ToastContextValue {
  push: (toast: ToastInput) => void;
  dismiss: (id: number) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

/** Dispara un toast cuando cambia una dependencia. */
export function useToastEffect(message: string | null, tone: ToastTone = "info", deps: unknown[] = []) {
  const { push } = useToast();
  useEffect(() => {
    if (message) push({ tone, title: message });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Provider de toasts — debe envolverse en el árbol de React. */
export interface ToastProviderProps {
  children: ReactNode;
  /** Auto-cierre por defecto. */
  defaultDuration?: number;
}

// Re-exportamos el provider desde este módulo para que HMR no se queje
// (no exporta componentes, solo contexto + hook). El provider en sí se
// sigue importando desde `toast.tsx` por compatibilidad.
