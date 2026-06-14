-- Volatility Dashboard: DVOL (Deribit), IV Percentile 90d, RV 30d, IV-RV spread, term structure.
-- Apenas BTC/ETH (liquidez de opcoes). Gating Pro+ pelo padrao do projeto (plan_is_advanced).
create table if not exists public.volatility_index (
  id bigserial primary key,
  asset text not null check (asset in ('BTC','ETH')),
  dvol numeric(10,4),
  ivp_90d numeric(5,2),
  rv_30d numeric(10,4),
  iv_rv_spread numeric(10,4),
  term_structure jsonb,
  ts timestamptz not null default now()
);

-- indice unico (asset,ts) — necessario para o upsert on_conflict do coletor
create unique index if not exists idx_volatility_index_asset_ts on public.volatility_index (asset, ts);

alter table public.volatility_index enable row level security;

create policy vol_index_pro_plus on public.volatility_index
  for select
  using (plan_is_advanced() and (asset = any (plan_assets())) and ts_within_history(ts));
