-- ═══════════════════════════════════════════════════════════════════════════
-- 010_exchange_flows.sql — Exchange flows (PRD3 §8.8.2) — Fase 6 (aba Smart Money)
-- Tabela e RLS prontas. A COLETA on-chain depende de fonte dedicada: as APIs
-- gratuitas (Blockchair) bloqueiam coleta frequente (HTTP 430) e uma lista curada
-- de poucos endereços não representa o fluxo total. Integrar via fonte paga
-- (CryptoQuant/Glassnode) ou indexador próprio em etapa seguinte.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.exchange_flows (
  id           bigint generated always as identity primary key,
  asset        text        not null,
  exchange     text        not null default 'aggregate',
  inflow_24h   numeric,
  outflow_24h  numeric,
  netflow_24h  numeric,                          -- + entrando nas exchanges (venda), − saindo (acumulação)
  netflow_7d   numeric,
  ts           timestamptz not null default now(),
  unique (asset, exchange, ts)
);
create index if not exists idx_exchange_flows_asset_ts on public.exchange_flows (asset, ts desc);

grant select on public.exchange_flows to authenticated;
alter table public.exchange_flows enable row level security;
drop policy if exists exchange_flows_select on public.exchange_flows;
create policy exchange_flows_select on public.exchange_flows for select to authenticated
using (public.plan_is_advanced() and public.ts_within_history(ts));
