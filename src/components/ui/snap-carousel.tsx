import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface SnapCarouselProps {
  /** Elemento accesible para describir el grupo (ej. "Ejemplos antes-después"). */
  ariaLabel: string;
  /** Hijos a renderizar. */
  children: ReactNode;
  /** Si true, deja asomar la siguiente tarjeta. */
  peek?: boolean;
  /** Centrar la tarjeta activa (true) o alinearla al inicio (false). */
  snapCenter?: boolean;
  /** Callback opcional con la posición actual (0..N-1). */
  onIndexChange?: (index: number) => void;
  /** Posición inicial. */
  startIndex?: number;
  className?: string;
}

/**
 * Carrusel horizontal nativo con:
 * - `scroll-snap` moderado y momentum táctil,
 * - peek de la siguiente tarjeta para insinuar que hay más,
 * - indicadores de desbordamiento (chevrones en los extremos),
 * - atajos de teclado (←/→) cuando un slide tiene foco,
 * - respeto de `prefers-reduced-motion` (heredado).
 */
export function SnapCarousel({
  ariaLabel,
  children,
  peek = true,
  snapCenter = true,
  onIndexChange,
  startIndex = 0,
  className,
}: SnapCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const slidesRef = useRef<Array<HTMLElement | null>>([]);
  const [over, setOver] = useState({ left: false, right: false });

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const handler = () => {
      setOver({
        left: node.scrollLeft > 4,
        right: node.scrollLeft + node.clientWidth < node.scrollWidth - 4,
      });
      // Detectar el slide más visible para onIndexChange.
      if (onIndexChange) {
        const center = node.scrollLeft + node.clientWidth / 2;
        let bestIndex = 0;
        let bestDist = Infinity;
        slidesRef.current.forEach((slide, i) => {
          if (!slide) return;
          const rect = slide.getBoundingClientRect();
          const nodeRect = node.getBoundingClientRect();
          const centerX = rect.left - nodeRect.left + node.scrollLeft + rect.width / 2;
          const dist = Math.abs(centerX - center);
          if (dist < bestDist) {
            bestDist = dist;
            bestIndex = i;
          }
        });
        onIndexChange(bestIndex);
      }
    };
    handler();
    node.addEventListener("scroll", handler, { passive: true });
    return () => node.removeEventListener("scroll", handler);
  }, [onIndexChange]);

  useEffect(() => {
    const node = scrollerRef.current;
    const slide = slidesRef.current[startIndex];
    if (!node || !slide) return;
    const nodeRect = node.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();
    const left = slideRect.left - nodeRect.left + node.scrollLeft;
    node.scrollTo({
      left: snapCenter ? left - node.clientWidth / 2 + slideRect.width / 2 : left,
      behavior: "smooth",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startIndex]);

  const scrollBy = (direction: 1 | -1) => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.82, behavior: "smooth" });
  };

  return (
    <div className={["relative", className ?? ""].join(" ")}>
      <div
        ref={scrollerRef}
        role="region"
        aria-roledescription="carrusel"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            scrollBy(1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            scrollBy(-1);
          }
        }}
        className={[
          "relative flex w-full snap-x snap-mandatory gap-3 overflow-x-auto",
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "px-1 py-1",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          "touch-pan-y",
        ].join(" ")}
      >
        {Array.isArray(children)
          ? children.map((child, i) => (
              <div
                key={i}
                ref={(el) => {
                  slidesRef.current[i] = el;
                }}
                className={[
                  "shrink-0",
                  snapCenter ? "snap-center" : "snap-start",
                ].join(" ")}
                style={
                  peek
                    ? { width: "min(82vw, 320px)" }
                    : { width: "100%" }
                }
              >
                {child}
              </div>
            ))
          : (
            <div
              ref={(el) => {
                slidesRef.current[0] = el;
              }}
              className="w-full shrink-0 snap-center"
            >
              {children}
            </div>
          )}
      </div>

      {/* Indicadores de desbordamiento (chevrones). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-0.5">
        {over.left ? (
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            className="press pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg/80 text-muted backdrop-blur transition-colors hover:text-fg"
            aria-label="Anterior"
            tabIndex={-1}
          >
            <ChevronLeft className="size-4" />
          </button>
        ) : null}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-0.5">
        {over.right ? (
          <button
            type="button"
            onClick={() => scrollBy(1)}
            className="press pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg/80 text-muted backdrop-blur transition-colors hover:text-fg"
            aria-label="Siguiente"
            tabIndex={-1}
          >
            <ChevronRight className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
