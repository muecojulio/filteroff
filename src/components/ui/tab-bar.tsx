import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface TabItem {
  /** Identificador único. */
  value: string;
  /** Etiqueta visible. */
  label: string;
  /** Icono a la izquierda. */
  icon?: ReactNode;
  /** Texto accesible opcional (sr-only). */
  srHint?: string;
}

export interface TabBarProps<T extends string = string> {
  items: TabItem[];
  value: T;
  onChange: (value: T) => void;
  /** Etiqueta accesible del grupo (describe el conjunto de pestañas). */
  ariaLabel: string;
  /** Permite cambiar con swipe horizontal en pantallas táctiles. */
  swipeable?: boolean;
  /** Posición del indicador. `top` o `bottom`. */
  indicator?: "top" | "bottom";
  /** Variante de tamaño. */
  size?: "md" | "lg";
  className?: string;
}

/**
 * TabBar con:
 * - indicador animado que se desliza hacia el tab activo,
 * - soporte de teclado (←/→, Home/End, Enter/Espacio),
 * - swipe horizontal opcional (no se activa en gestos claramente verticales),
 * - respeto de `prefers-reduced-motion` (heredado del CSS global).
 */
export function TabBar<T extends string = string>({
  items,
  value,
  onChange,
  ariaLabel,
  swipeable = true,
  indicator = "bottom",
  size = "md",
  className,
}: TabBarProps<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = items.findIndex((item) => item.value === value);
  const [startX, setStartX] = useState<number | null>(null);
  const [startY, setStartY] = useState<number | null>(null);
  const [over, setOver] = useState({ left: false, right: false });

  // Centrar el tab activo al cambiar (móvil).
  useEffect(() => {
    const node = tabsRef.current[activeIndex];
    const scroller = scrollerRef.current;
    if (!node || !scroller) return;
    const targetLeft = node.offsetLeft - scroller.clientWidth / 2 + node.clientWidth / 2;
    scroller.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
  }, [activeIndex]);

  // Detectar desbordamiento a izquierda/derecha.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const handler = () => {
      setOver({
        left: scroller.scrollLeft > 8,
        right: scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 8,
      });
    };
    handler();
    scroller.addEventListener("scroll", handler, { passive: true });
    return () => scroller.removeEventListener("scroll", handler);
  }, [items.length]);

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    const target = items[next];
    if (target) {
      onChange(target.value as T);
      tabsRef.current[next]?.focus();
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!swipeable) return;
    // No iniciar swipe si el gesto nace sobre un control interactivo.
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, textarea, [role=tab]")) return;
    setStartX(event.clientX);
    setStartY(event.clientY);
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (startX == null || startY == null) {
      setStartX(null);
      setStartY(null);
      return;
    }
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    // 1.2 ratio + distancia mínima para considerarlo swipe horizontal.
    if (absX > absX * 1.2 - absY * 1.2 + 24 && absX > 60 && absX > absY * 1.4) {
      const dir = dx < 0 ? 1 : -1;
      const next = items[activeIndex + dir];
      if (next) onChange(next.value as T);
    } else if (absX > 40 && absX > absY * 1.2) {
      const dir = dx < 0 ? 1 : -1;
      const next = items[activeIndex + dir];
      if (next) onChange(next.value as T);
    }
    setStartX(null);
    setStartY(null);
  };

  return (
    <div className={["relative", className ?? ""].join(" ")}>
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          setStartX(null);
          setStartY(null);
        }}
        className={[
          "relative flex w-full select-none items-stretch gap-1 overflow-x-auto",
          "scroll-px-2 snap-x snap-mandatory",
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          indicator === "top" ? "pb-2" : "pt-2",
          size === "lg" ? "h-16" : "h-14",
        ].join(" ")}
      >
        {items.map((item, index) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              ref={(el) => {
                tabsRef.current[index] = el;
              }}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`tabpanel-${item.value}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(item.value as T)}
              onKeyDown={(e) => onKey(e, index)}
              className={[
                "press relative z-10 flex min-w-[44px] flex-1 snap-center items-center justify-center gap-2 px-3",
                "rounded-full text-sm font-medium",
                "transition-colors duration-200 ease-out",
                "outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                "touch-manipulation",
                active ? "text-bg" : "text-muted hover:text-fg",
              ].join(" ")}
            >
              {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
              <span className="truncate">{item.label}</span>
              {item.srHint ? <span className="sr-only">{item.srHint}</span> : null}
            </button>
          );
        })}

        {/* Indicador animado: una píldora que se desplaza suavemente. */}
        <span
          aria-hidden="true"
          className={[
            "pointer-events-none absolute left-0 top-0 z-0 rounded-full bg-primary",
            "transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            size === "lg" ? "h-12" : "h-10",
            indicator === "top" ? "top-1" : "bottom-1",
          ].join(" ")}
          style={{
            width: "var(--tab-indicator-w, 0px)",
            transform: "translate3d(var(--tab-indicator-x, 0), 0, 0)",
          }}
        />
      </div>

      {/* Indicadores de desbordamiento (visuales, no bloquean el scroll). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-0.5 text-muted">
        {over.left ? <ChevronLeft className="size-4 opacity-60" /> : null}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-0.5 text-muted">
        {over.right ? <ChevronRight className="size-4 opacity-60" /> : null}
      </div>
    </div>
  );
}
