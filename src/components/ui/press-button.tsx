import { Loader2, Check, AlertTriangle } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/**
 * Estados del botón. El componente los comunica a la vez con icono, color y
 * etiqueta accesible (aria-busy), así no depende solo del color para que
 * alguien con baja visión o sin color sepa qué pasó.
 */
export type PressStatus = "idle" | "loading" | "success" | "error";

export interface PressButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Estado visual. `loading` deshabilita el botón; `success`/`error` son momentáneos. */
  status?: PressStatus;
  /** Variante visual. */
  variant?: "solid" | "outline" | "ghost" | "danger";
  /** Tamaño — define la altura mínima. 44 px por defecto (objetivo táctil accesible). */
  size?: "sm" | "md" | "lg";
  /** Icono a la izquierda. */
  icon?: ReactNode;
  /** Etiqueta visible del botón (sigue siendo requerida por a11y). */
  label: ReactNode;
  /** Mensaje accesible opcional para describir el estado a un screen reader. */
  statusMessage?: string;
}

const variantClass: Record<NonNullable<PressButtonProps["variant"]>, string> = {
  solid: "bg-primary text-bg border border-primary shadow-[0_8px_24px_-12px_rgba(224,122,61,0.6)]",
  outline: "bg-surface text-fg border border-border",
  ghost: "bg-transparent text-fg border border-transparent",
  danger: "bg-bg text-primary border border-primary/40",
};

const sizeClass: Record<NonNullable<PressButtonProps["size"]>, string> = {
  sm: "h-10 px-3 text-sm rounded-xl gap-1.5",
  md: "h-12 px-4 text-sm rounded-2xl gap-2",
  lg: "h-14 px-5 text-base rounded-2xl gap-2.5",
};

/**
 * Botón con microinteracciones coherentes. Reúne:
 * - objetivo táctil ≥ 44×44 px (size md o lg),
 * - hundimiento al pulsar (`press`),
 * - estados loading/success/error visibles también con icono,
 * - `touch-action: manipulation` para que el doble tap no haga zoom.
 */
export const PressButton = forwardRef<HTMLButtonElement, PressButtonProps>(function PressButton(
  { status = "idle", variant = "outline", size = "md", icon, label, statusMessage, className, disabled, type, ...rest },
  ref,
) {
  const isDisabled = disabled || status === "loading";
  const statusIcon =
    status === "loading" ? (
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
    ) : status === "success" ? (
      <Check className="size-4" aria-hidden="true" />
    ) : status === "error" ? (
      <AlertTriangle className="size-4" aria-hidden="true" />
    ) : null;

  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={isDisabled}
      data-status={status}
      aria-busy={status === "loading" || undefined}
      aria-live={status === "success" || status === "error" ? "polite" : undefined}
      className={[
        "press relative inline-flex select-none items-center justify-center font-medium",
        "transition-[transform,background-color,border-color,box-shadow,opacity] duration-200",
        "outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "[&:not(:disabled)]:active:scale-[0.97]",
        "touch-manipulation",
        variantClass[variant],
        sizeClass[size],
        status === "error" ? "animate-[shake_0.4s_ease]" : "",
        className ?? "",
      ].join(" ")}
      {...rest}
    >
      {statusIcon ? <span className="shrink-0">{statusIcon}</span> : icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="truncate">{label}</span>
      {statusMessage ? <span className="sr-only">{statusMessage}</span> : null}
    </button>
  );
});
