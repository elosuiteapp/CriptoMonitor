-- ═══════════════════════════════════════════════════════════════════════════
-- 054_orderbook_depth.sql — Escada COMPLETA do order book (heatmap de book) — Tier 1
-- Snapshot bucketizado do book inteiro (±3,5% do preço) por ativo×exchange, a cada
-- 1 min, guardado como JSONB (1 linha/snapshot). SEM o filtro de threshold das
-- paredes — aqui queremos a liquidez contínua p/ o heatmap (preço × tempo) no
-- cockpit. Camada Pro+ (métricas avançadas), como as paredes do book.
-- Retenção: 48h (janela rolante; o heatmap não precisa de mais → trava o storage).
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.orderbook_depth (
  asset      text        not null,
  exchange   text        not null,         -- binance | coinbase | okx
  ts         timestamptz not null,
  mid        double precision,
  bids       jsonb       not null default '{}'::jsonb,  -- {preço_do_bucket: notional_usd}
  asks       jsonb       not null default '{}'::jsonb,
  primary key (asset, exchange, ts)
);
create index if not exists idx_orderbook_depth_asset_ts on public.orderbook_depth (asset, ts desc);

grant select on public.orderbook_depth to authenticated;
alter table public.orderbook_depth enable row level security;
drop policy if exists orderbook_depth_select on public.orderbook_depth;
create policy orderbook_depth_select on public.orderbook_depth for select to authenticated
using (public.plan_is_advanced() and public.ts_within_history(ts));

-- Retenção rolante de 48h (a cada 30 min). pg_cron já é usado no projeto.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'orderbook_depth_retention';
select cron.schedule(
  'orderbook_depth_retention',
  '*/30 * * * *',
  $$delete from public.orderbook_depth where ts < now() - interval '48 hours'$$
);
