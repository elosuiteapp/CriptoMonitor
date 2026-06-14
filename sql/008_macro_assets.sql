-- ═══════════════════════════════════════════════════════════════════════════
-- 008_macro_assets.sql — Macro & Correlações (PRD3 §8.8.3) — Fase 6
-- Fonte: Yahoo Finance (DXY, S&P 500, ouro, 10Y). Aba "Macro & Correlações" (Pro).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.macro_assets (
  id          bigint generated always as identity primary key,
  symbol      text        not null,          -- DXY | SPX | GOLD | US10Y
  name        text        not null,
  price       numeric,
  change_24h  numeric,                        -- fração (ex: 0.012 = +1,2%)
  change_7d   numeric,
  ts          timestamptz not null default now(),
  unique (symbol, ts)
);
create index if not exists idx_macro_assets_symbol_ts on public.macro_assets (symbol, ts desc);

create table if not exists public.macro_correlations (
  id            bigint generated always as identity primary key,
  asset         text        not null,         -- BTC | ETH | SOL
  macro_symbol  text        not null,          -- DXY | SPX | GOLD | US10Y
  corr_30d      numeric,                        -- correlação de Pearson (−1..+1)
  ts            timestamptz not null default now(),
  unique (asset, macro_symbol, ts)
);
create index if not exists idx_macro_corr_asset_ts on public.macro_correlations (asset, ts desc);

-- RLS — dados macro são da aba Pro (métricas avançadas)
grant select on public.macro_assets, public.macro_correlations to authenticated;
alter table public.macro_assets       enable row level security;
alter table public.macro_correlations enable row level security;

drop policy if exists macro_assets_select on public.macro_assets;
create policy macro_assets_select on public.macro_assets for select to authenticated
using (public.plan_is_advanced() and public.ts_within_history(ts));

drop policy if exists macro_corr_select on public.macro_correlations;
create policy macro_corr_select on public.macro_correlations for select to authenticated
using (public.plan_is_advanced() and public.ts_within_history(ts));
