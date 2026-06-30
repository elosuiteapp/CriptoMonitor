-- 069 — Aba Macro lenta / "Dados macro indisponíveis" intermitente. A query
-- `select ... from macro_assets order by ts desc limit 24` (sem filtro de symbol) só tinha
-- índice (symbol, ts), que NÃO serve esse ORDER BY → Seq Scan das ~7,4k linhas aplicando o
-- RLS (plan_is_advanced) por linha + Sort → lento/timeout. Índice por ts resolve: Index Scan
-- lendo só as ~24 linhas mais recentes (validado: 28 ms, era segundos).
create index if not exists idx_macro_assets_ts on public.macro_assets using btree (ts desc);
