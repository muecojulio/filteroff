import { type ChangeEvent, useId } from "react";

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  disabled?: boolean;
}

/**
 * Slider accesible con etiqueta visible + valor actual. Aporta pista textual
 * ("0% — 100%") para usuarios con visión reducida y respeta
 * `prefers-reduced-motion` heredado del CSS global.
 */
export function Slider({ label, value, min, max, step = 1, onChange, format, disabled }: SliderProps) {
  const id = useId();
  const display = format ? format(value) : String(value);
  return (
    <div className="block text-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor={id} className="text-muted">
          {label}
        </label>
        <span aria-hidden="true" className="font-medium text-fg tabular-nums">
          {display}
        </span>
        <span className="sr-only">Valor actual {display}, rango de {min} a {max}.</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value))}
        className="w-full touch-manipulation"
      />
    </div>
  );
}
