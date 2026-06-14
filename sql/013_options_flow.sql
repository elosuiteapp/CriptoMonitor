-- ═══════════════════════════════════════════════════════════════════════════
-- 013_options_flow.sql — Proxy de fluxo de opções (HIRO simplificado, PRD3 Tier)
-- Delta-fluxo líquido das negociações de opções da Deribit por ciclo (5 min).
-- Aproximação do HIRO (não tick a tick). Aba/Módulo Gamma (Pro+).
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.options_flow (
  id              bigint generated always as identity primary key,
  asset           text        not null,
  net_delta_flow  numeric,                     -- + compra de call/venda de put (hedge comprador), − inverso
  trades_count    int,
  ts              timestamptz not null default now(),
  unique (asset, ts)
);
create index if not exists idx_options_flow_asset_ts on public.options_flow (asset, ts desc);

grant select on public.options_flow to authenticated;
alter table public.options_flow enable row level security;
drop policy if exists options_flow_select on public.options_flow;
create policy options_flow_select on public.options_flow for select to authenticated
using (public.plan_is_advanced() and public.ts_within_history(ts));
