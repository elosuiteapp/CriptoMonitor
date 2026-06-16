-- ═══════════════════════════════════════════════════════════════════════════
-- 024_cot_positioning.sql — CFTC Commitment of Traders (CME BTC/ETH) — aba Macro
-- Posicionamento institucional SEMANAL nos futuros CME cheios: Asset Managers (real
-- money) e Leveraged Funds (hedge funds). Dado estrutural/lento → vive na aba Macro
-- (lido direto da tabela, não vai pro snapshot do cockpit).
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.cot_positioning (
  id                bigint generated always as identity primary key,
  asset             text not null,            -- BTC | ETH
  report_date       date not null,            -- data do relatório (terça)
  asset_mgr_long    integer,
  asset_mgr_short   integer,
  asset_mgr_net     integer,                  -- long − short
  lev_money_long    integer,
  lev_money_short   integer,
  lev_money_net     integer,
  asset_mgr_net_chg integer,                  -- variação semanal do net (asset managers)
  lev_money_net_chg integer,                  -- variação semanal do net (leveraged funds)
  open_interest     integer,
  ts                timestamptz not null default now(),
  unique (asset, report_date)
);
create index if not exists idx_cot_positioning_asset on public.cot_positioning (asset, report_date desc);

grant select on public.cot_positioning to authenticated;
alter table public.cot_positioning enable row level security;
drop policy if exists cot_positioning_select on public.cot_positioning;
create policy cot_positioning_select on public.cot_positioning for select to authenticated
using (public.plan_is_advanced() and public.ts_within_history(ts));
