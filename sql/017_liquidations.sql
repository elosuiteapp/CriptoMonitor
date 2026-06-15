-- ═══════════════════════════════════════════════════════════════════════════
-- 017_liquidations.sql — Liquidações realizadas por bucket de 5 min (heatmap/série)
-- Coinalyze /liquidation-history interval=5min: long vs short notional (USD) por
-- bucket, somado entre as exchanges principais. Alimenta o gráfico de barras
-- divergentes (shorts ↑ / longs ↓) com spot sobreposto, no Cockpit (Pro+).
-- A coluna agregada de 24h continua em `derivatives` (card "Liquidações").
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.liquidations (
  id         bigint generated always as identity primary key,
  asset      text        not null,
  ts         timestamptz not null,          -- início do bucket de 5 min (UTC)
  long_usd   numeric,                       -- longs liquidados no bucket (preço caindo)
  short_usd  numeric,                       -- shorts liquidados no bucket (preço subindo)
  unique (asset, ts)
);
create index if not exists idx_liquidations_asset_ts on public.liquidations (asset, ts desc);

grant select on public.liquidations to authenticated;
alter table public.liquidations enable row level security;
drop policy if exists liquidations_select on public.liquidations;
create policy liquidations_select on public.liquidations for select to authenticated
using (public.plan_is_advanced() and public.ts_within_history(ts));
