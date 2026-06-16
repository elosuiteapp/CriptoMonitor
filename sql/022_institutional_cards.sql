-- ═══════════════════════════════════════════════════════════════════════════
-- 022_institutional_cards.sql — Camada institucional do cockpit (Pro+)
-- Duas novas fontes:
--   • etf_flows        — fluxo líquido de ETFs spot BTC/ETH (Farside via relay), diário
--   • market_liquidity — oferta de stablecoins + TVL DeFi total (DefiLlama), mercado
-- Os valores também entram no market_snapshot.payload (consumo do cockpit); estas
-- tabelas guardam o histórico e seguem o mesmo gate de plano das demais (advanced).
-- (CME ficou de fora: a Coinalyze não cobre a CME — código 0 é a BitMEX. Precisa de
--  fonte CME dedicada/paga.)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ETFs spot (BTC/ETH) ──────────────────────────────────────────────────────
create table if not exists public.etf_flows (
  id            bigint generated always as identity primary key,
  asset         text        not null,         -- BTC | ETH
  ts            timestamptz not null,          -- bucket de 5 min (UTC)
  net_flow_usd  numeric,                       -- fluxo líquido do último dia útil (US$)
  flow_7d_usd   numeric,                       -- soma 7 dias (US$)
  streak_days   integer,                       -- dias consecutivos no mesmo sentido (+entrada / −saída)
  as_of         text,                          -- rótulo do dia de referência (ex.: "15 Jun 2026")
  unique (asset, ts)
);
create index if not exists idx_etf_flows_asset_ts on public.etf_flows (asset, ts desc);

grant select on public.etf_flows to authenticated;
alter table public.etf_flows enable row level security;
drop policy if exists etf_flows_select on public.etf_flows;
create policy etf_flows_select on public.etf_flows for select to authenticated
using (public.plan_is_advanced() and public.ts_within_history(ts));

-- ── Liquidez do mercado (stablecoins + TVL) ──────────────────────────────────
create table if not exists public.market_liquidity (
  id                     bigint generated always as identity primary key,
  ts                     timestamptz not null unique,   -- bucket de 5 min (UTC) — único (mercado todo)
  total_stablecoin_usd   numeric,               -- oferta total de stablecoins (dry powder)
  stablecoin_chg_7d_usd  numeric,               -- variação 7d (US$)
  stablecoin_chg_7d_pct  numeric,               -- variação 7d (%)
  total_tvl_usd          numeric                -- TVL DeFi total (todas as chains)
);
create index if not exists idx_market_liquidity_ts on public.market_liquidity (ts desc);

grant select on public.market_liquidity to authenticated;
alter table public.market_liquidity enable row level security;
drop policy if exists market_liquidity_select on public.market_liquidity;
create policy market_liquidity_select on public.market_liquidity for select to authenticated
using (public.plan_is_advanced() and public.ts_within_history(ts));
