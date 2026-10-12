import { type ReactNode } from "react";

export interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  children: ReactNode;
  /** Aria label cuando el contenido es solo icono. */
  ariaLabel?: string;
  tone?: "default" | "primary";
}

/**
 * Filtro / chip accesible. El foco es visible y el estado activo se distingue
 * con un fondo de marca, no solo con el color de texto.
 */
export function Chip({ active, onClick, icon, children, ariaLabel, tone = "default" }: ChipProps) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      aria-pressed={onClick ? !!active : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      className={[
        "press inline-flex h-9 select-none items-center gap-1.5 rounded-full border px-3 text-sm",
        "transition-colors duration-150",
        "outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "touch-manipulation",
        active
          ? tone === "primary"
            ? "border-primary bg-primary text-bg"
            : "border-primary/60 bg-primary/15 text-fg"
          : "border-border bg-surface text-muted hover:text-fg",
      ].join(" ")}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="truncate">{children}</span>
    </Tag>
  );
}
