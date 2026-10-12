import { forwardRef, type HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Nivel de énfasis visual. `flat` se ve plano, `raised` añade glow. */
  emphasis?: "flat" | "raised" | "glow";
  /** Padding. */
  padding?: "sm" | "md" | "lg";
  /** Cambia el fondo a `bg-bg` (oscuro) en vez del surface. */
  tone?: "surface" | "bg";
  /** Estado seleccionado. */
  selected?: boolean;
}

const paddingMap = { sm: "p-3", md: "p-4", lg: "p-5" } as const;
const toneMap = {
  surface: "bg-surface",
  bg: "bg-bg",
} as const;

/**
 * Caja base del sistema. Tres énfasis para variar el contraste dentro de una
 * pantalla sin perder la jerarquía. `selected` añade un borde primario y un
 * halo para que el estado activo se vea sin depender solo del color.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { emphasis = "flat", padding = "md", tone = "surface", selected, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      data-selected={selected || undefined}
      className={[
        "relative rounded-3xl border transition-shadow duration-200",
        toneMap[tone],
        paddingMap[padding],
        selected
          ? "border-primary shadow-[0_0_0_3px_rgba(224,122,61,0.18)]"
          : "border-border",
        emphasis === "raised" ? "shadow-[0_18px_60px_-30px_rgba(0,0,0,0.5)]" : "",
        emphasis === "glow" ? "shadow-[0_18px_60px_-20px_rgba(224,122,61,0.45)]" : "",
        className ?? "",
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
});
