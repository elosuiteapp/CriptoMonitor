-- ═══════════════════════════════════════════════════════════════════════════
-- 046_orderbook_imbalance.sql — Pressão do book (bid × ask perto do preço)
-- OrbeView
--
-- Snapshot da liquidez PARADA somada perto do preço (Binance + Coinbase REST),
-- em duas faixas: ±0,5% (perto) e ±2% (amplo). Vira o gauge "book comprador ×
-- vendedor". Diferente do CVD (negócio executado/fluxo): aqui é ordem limite
-- esperando — leitura forte é cruzar os dois (book + CVD na mesma direção).
-- Camada avançada (Pro+), igual às paredes do book.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.orderbook_imbalance (
  id            bigint generated always as identity primary key,
  asset         text        not null,
  bid_near_usd  numeric     not null default 0,   -- bids dentro de ±0,5% do mid (Binance+Coinbase)
  ask_near_usd  numeric     not null default 0,   -- asks dentro de ±0,5%
  bid_wide_usd  numeric     not null default 0,   -- bids dentro de ±2%
  ask_wide_usd  numeric     not null default 0,   -- asks dentro de ±2%
  ts            timestamptz not null default now(),
  unique (asset, ts)
);
create index if not exists idx_orderbook_imbalance_asset_ts on public.orderbook_imbalance (asset, ts desc);

grant select on public.orderbook_imbalance to authenticated;
alter table public.orderbook_imbalance enable row level security;
drop policy if exists orderbook_imbalance_select on public.orderbook_imbalance;
create policy orderbook_imbalance_select on public.orderbook_imbalance for select to authenticated
using (public.plan_is_advanced() and public.ts_within_history(ts));
