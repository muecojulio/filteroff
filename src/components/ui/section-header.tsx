import { type ReactNode } from "react";

/**
 * Encabezado de sección. El indicador de eyebrow se anima con shimmer para
 * mantener viva la jerarquía visual. Toda la cabecera es semántica (`h2`).
 */
export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  trailing,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="rise flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-primary">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
            </span>
            {eyebrow}
          </p>
        ) : null}
        <h2 className="font-display text-2xl font-medium leading-tight">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
