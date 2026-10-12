-- 0004_indexes_and_cache.sql
-- Índices para los conteos del resumen (lookups por ventana de tiempo) y una
-- tabla de cache para la API del QR, así el endpoint no recalcula el SVG
-- cada vez que el cliente abre la pantalla "Instalar".

-- Lookup principal del resumen: 30 días, agrupado por (kind, engine).
create index if not exists restore_stats_recent_idx
  on restore_stats (created_at desc, media_kind, engine);

-- Rate limit por horas: cuenta del último día (recordRestore) y de la última
-- hora (cloudBudgetOpen). Cubre ambos con un índice sobre engine+created_at.
create index if not exists restore_stats_engine_time_idx
  on restore_stats (engine, created_at desc);

-- Tabla de cache para el QR (key = host de la app, svg = salida del lib).
create table if not exists qr_cache (
  origin       text primary key,
  svg          text not null,
  generated_at timestamptz not null default now()
);
