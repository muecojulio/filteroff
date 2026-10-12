-- El refuerzo gratis (Apps Gradio públicas, sin key) entra como motor propio:
-- se relaja el catálogo de motores sin perder los datos previos.

alter table restore_stats drop constraint if exists restore_stats_engine_check;

alter table restore_stats
  add constraint restore_stats_engine_check
  check (engine in ('local', 'free', 'cloud'));
