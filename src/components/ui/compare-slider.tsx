import { useId, useRef, type PointerEvent } from "react";

export interface CompareSliderProps {
  before: string;
  after: string;
  afterAlt: string;
  value: number; // 0..100
  onChange: (value: number) => void;
  aspectRatio?: string;
}

/**
 * Slider antes/después accesible: el control principal es el `<input
 * type="range">` y las dos imágenes se montan con `alt` correcto. La
 * manipulación táctil (drag) se hace interceptando eventos solo en el
 * área de previsualización, sin impedir el scroll vertical.
 */
export function CompareSlider({ before, after, afterAlt, value, onChange, aspectRatio = "1 / 1" }: CompareSliderProps) {
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  function updateFromPointer(event: PointerEvent<HTMLDivElement>) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const ratio = ((event.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.max(2, Math.min(98, ratio));
    onChange(Math.round(clamped));
  }

  return (
    <div
      ref={wrapRef}
      className="relative overflow-hidden rounded-2xl border border-border bg-bg"
      style={{ aspectRatio }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 0) return;
        updateFromPointer(event);
      }}
    >
      <img
        src={after}
        alt={afterAlt}
        className="absolute inset-0 h-full w-full select-none object-contain"
        draggable={false}
      />
      <div
        className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${value}%` }}
        aria-hidden="true"
      >
        <img
          src={before}
          alt=""
          className="absolute inset-0 h-full w-full select-none object-contain"
          style={{ width: `${(100 / Math.max(value, 1)) * 100}%`, maxWidth: "none" }}
          draggable={false}
        />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0"
        style={{ left: `${value}%`, transform: "translateX(-50%)" }}
      >
        <div className="relative h-full w-0.5 bg-bg/80 shadow-[0_0_12px_rgba(0,0,0,0.6)]" />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-0 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg text-fg shadow-lg">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 18-6-6 6-6" />
            <path d="m15 6 6 6-6 6" />
          </svg>
        </div>
      </div>
      <label className="sr-only" htmlFor={id}>
        Comparar antes y después
      </label>
      <input
        id={id}
        type="range"
        min={2}
        max={98}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="absolute inset-x-4 bottom-3 z-10 touch-manipulation"
        aria-valuetext={`${value}% del antes`}
      />
    </div>
  );
}
