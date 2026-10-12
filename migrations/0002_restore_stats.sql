create table if not exists restore_stats (
  id          bigserial primary key,
  media_kind  text not null check (media_kind in ('photo', 'video')),
  engine      text not null check (engine in ('local', 'cloud')),
  covered_bp  integer not null default 0,
  duration_ms integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists restore_stats_created_idx
  on restore_stats (created_at desc);

create index if not exists restore_stats_kind_created_idx
  on restore_stats (media_kind, created_at desc);

create index if not exists restore_stats_engine_created_idx
  on restore_stats (engine, created_at desc);
