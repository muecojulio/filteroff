import { useRef, useState, type ReactNode } from "react";

export interface SwipeRevealProps {
  /** Contenido principal de la tarjeta. */
  children: ReactNode;
  /** Acciones que aparecen al deslizar. Siempre accesibles también por teclado. */
  actions: { label: string; icon?: ReactNode; onSelect: () => void; tone?: "default" | "danger" }[];
  /** Anchura máxima del panel de acciones. Por defecto 96 px. */
  actionWidth?: number;
  /** Callback al cerrar (p.ej. para confirmar gestos). */
  onClose?: () => void;
  className?: string;
}

/**
 * Tarjeta con swipe para revelar acciones. Mantiene el scroll vertical
 * intacto: solo se activa cuando el gesto es claramente horizontal.
 *
 *  - El umbral para abrir/cerrar es la mitad del panel de acciones.
 *  - Las acciones siempre son accesibles por teclado (botón "Más" que
 *    abre el panel) y por tecnología de asistencia, no dependen del
 *    swipe.
 *  - Cuando el panel está cerrado, las acciones se excluyen del orden
 *    de tabulación (`tabIndex={-1}`) y del lector de pantalla
 *    (`aria-hidden`).
 */
export function SwipeReveal({ children, actions, actionWidth = 96, onClose, className }: SwipeRevealProps) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const locked = useRef<"x" | "y" | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const total = actions.length * actionWidth;
  const max = total;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, textarea")) return;
    startX.current = event.clientX;
    startY.current = event.clientY;
    locked.current = null;
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (startX.current == null || startY.current == null) return;
    const dx = event.clientX - startX.current;
    const dy = event.clientY - startY.current;
    if (locked.current == null) {
      // Decide el eje: requiere desplazamiento claro.
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      locked.current = Math.abs(dx) > Math.abs(dy) * 1.3 ? "x" : "y";
    }
    if (locked.current !== "x") return;
    event.preventDefault();
    const next = Math.max(-max, Math.min(0, open ? offset + dx : dx));
    setOffset(next);
  };
  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (startX.current == null || startY.current == null) return;
    const dx = event.clientX - startX.current;
    const finalOffset = open ? offset + dx : dx;
    const shouldOpen = finalOffset < -max / 2;
    setOpen(shouldOpen);
    setOffset(shouldOpen ? -max : 0);
    if (!shouldOpen) onClose?.();
    startX.current = null;
    startY.current = null;
    locked.current = null;
  };

  return (
    <div
      className={[
        "relative isolate overflow-hidden rounded-2xl border border-border bg-surface",
        className ?? "",
      ].join(" ")}
    >
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={() => {
          setOffset(0);
          setOpen(false);
          startX.current = null;
          startY.current = null;
          locked.current = null;
        }}
        style={{ transform: `translate3d(${offset}px, 0, 0)` }}
        className={[
          "relative z-10 transition-transform duration-200 ease-out",
          "touch-pan-y",
        ].join(" ")}
      >
        {children}
      </div>
      <div
        aria-hidden={!open}
        className={[
          "absolute inset-y-0 right-0 z-0 flex items-center justify-end gap-1 px-2",
        ].join(" ")}
        style={{ width: max }}
      >
        {actions.map((action, i) => (
          <button
            key={i}
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              setOffset(0);
              setOpen(false);
              action.onSelect();
            }}
            className={[
              "press flex h-10 w-10 items-center justify-center rounded-xl border",
              action.tone === "danger"
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border bg-bg text-fg",
            ].join(" ")}
            aria-label={action.label}
            title={action.label}
          >
            {action.icon ?? <span className="text-xs">{action.label.charAt(0)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
