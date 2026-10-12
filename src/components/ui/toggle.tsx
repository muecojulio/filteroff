import * as Switch from "@radix-ui/react-switch";
import type { ReactNode } from "react";

export interface ToggleProps {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

/**
 * Interruptor accesible. La etiqueta se asocia al control mediante el id
 * automático de Radix (`htmlFor` implícito), y la pista secundaria aporta
 * contexto sin saturar la fila.
 */
export function Toggle({ label, hint, checked, onChange, disabled }: ToggleProps) {
  return (
    <label
      className={[
        "flex items-center justify-between gap-3 rounded-xl px-2 py-1.5",
        "transition-colors hover:bg-bg/40",
        disabled ? "opacity-50" : "cursor-pointer",
      ].join(" ")}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-tight">{label}</p>
        {hint ? <p className="mt-0.5 text-xs leading-snug text-muted">{hint}</p> : null}
      </div>
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={typeof label === "string" ? label : undefined}
        className={[
          "relative h-7 w-12 shrink-0 rounded-full border border-border bg-bg",
          "transition-colors duration-200 ease-out",
          "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
          "focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          "touch-manipulation",
        ].join(" ")}
      >
        <Switch.Thumb
          className={[
            "block size-5 translate-x-1 rounded-full bg-fg",
            "transition-transform duration-200 ease-out",
            "data-[state=checked]:translate-x-6 data-[state=checked]:bg-bg",
          ].join(" ")}
        />
      </Switch.Root>
    </label>
  );
}
