-- ═══════════════════════════════════════════════════════════════════════════
-- 009_orderbook_walls.sql — Paredes do order book (PRD3 §8.8.1) — Fase 6
-- Liquidez parada concentrada por faixa de preço (Binance + Coinbase REST depth).
-- Camada no gráfico (Pro). RLS = métricas avançadas.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.orderbook_walls (
  id            bigint generated always as identity primary key,
  asset         text        not null,
  exchange      text        not null,         -- binance | coinbase
  side          text        not null check (side in ('bid', 'ask')),
  price         numeric     not null,
  notional_usd  numeric     not null,
  ts            timestamptz not null default now(),
  unique (asset, exchange, side, price, ts)
);
create index if not exists idx_orderbook_walls_asset_ts on public.orderbook_walls (asset, ts desc);

grant select on public.orderbook_walls to authenticated;
alter table public.orderbook_walls enable row level security;
drop policy if exists orderbook_walls_select on public.orderbook_walls;
create policy orderbook_walls_select on public.orderbook_walls for select to authenticated
using (public.plan_is_advanced() and public.ts_within_history(ts));
