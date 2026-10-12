import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";

export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
  keywords?: string[];
}

export interface ComboboxProps {
  label: string;
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  /** Texto cuando no hay resultados. */
  emptyText?: string;
  /** Icono opcional al inicio del campo. */
  icon?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Combobox accesible con búsqueda incremental. Ignora mayúsculas, minúsculas
 * y diacríticos para que "foto" y "fótò" coincidan. La lista se cierra con
 * Escape, Enter confirma y las flechas ↑/↓ mueven la selección activa.
 */
export function Combobox({ label, options, value, onChange, emptyText = "Sin resultados", icon, placeholder, disabled }: ComboboxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const normalized = useMemo(() => {
    const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const q = strip(query.trim());
    if (!q) return options.slice(0, 30);
    return options.filter((opt) => {
      const haystack = strip([opt.label, opt.hint ?? "", ...(opt.keywords ?? [])].join(" "));
      return haystack.includes(q);
    }).slice(0, 30);
  }, [options, query]);

  useEffect(() => {
    setActive((i) => Math.max(0, Math.min(i, normalized.length - 1)));
  }, [normalized.length]);

  useEffect(() => {
    const handler = (event: globalThis.MouseEvent) => {
      if (!open) return;
      const target = event.target as HTMLElement | null;
      if (target && rootId) {
        const root = document.getElementById(rootId);
        if (root && !root.contains(target)) setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, rootId]);

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(normalized.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(normalized.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const pick = normalized[active];
      if (pick) {
        onChange(pick.value);
        setQuery(pick.label);
        setOpen(false);
        inputRef.current?.blur();
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const selected = options.find((o) => o.value === value) ?? null;
  const displayValue = open ? query : (selected?.label ?? query);

  // Mantener visible el elemento activo al navegar.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  return (
    <div id={rootId} className="relative">
      <label className="mb-1 block text-sm text-muted">{label}</label>
      <div
        className={[
          "flex h-12 items-center gap-2 rounded-2xl border bg-surface px-3",
          "transition-colors duration-150",
          open ? "border-primary" : "border-border",
          disabled ? "opacity-50" : "",
        ].join(" ")}
      >
        {icon ? <span className="text-muted">{icon}</span> : <Search className="size-4 text-muted" />}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${rootId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && normalized[active] ? `${rootId}-opt-${normalized[active].value}` : undefined}
          value={displayValue}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
        {displayValue ? (
          <button
            type="button"
            aria-label="Limpiar"
            tabIndex={-1}
            onClick={() => {
              setQuery("");
              onChange(null);
              inputRef.current?.focus();
            }}
            className="press flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-bg hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      {open ? (
        <ul
          id={`${rootId}-list`}
          ref={listRef}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-2 max-h-64 overflow-auto rounded-2xl border border-border bg-bg/95 p-1 shadow-[0_18px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur"
        >
          {normalized.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">{emptyText}</li>
          ) : (
            normalized.map((opt, i) => {
              const isActive = i === active;
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={opt.value === value}
                  data-index={i}
                  id={`${rootId}-opt-${opt.value}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(opt.value);
                    setQuery(opt.label);
                    setOpen(false);
                  }}
                  className={[
                    "flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm",
                    "transition-colors duration-100",
                    isActive ? "bg-primary/15 text-fg" : "text-fg",
                  ].join(" ")}
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.hint ? <span className="shrink-0 text-xs text-muted">{opt.hint}</span> : null}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
