-- ═══════════════════════════════════════════════════════════════════════════
-- 012_gamma_levels.sql — Níveis para o gráfico temporal de gamma (estilo SpotGamma)
-- Call/Put Wall e strike médio (calls/puts) por ciclo, no gamma_profile.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.gamma_profile add column if not exists call_wall       numeric;
alter table public.gamma_profile add column if not exists put_wall        numeric;
alter table public.gamma_profile add column if not exists avg_call_strike numeric;
alter table public.gamma_profile add column if not exists avg_put_strike  numeric;
