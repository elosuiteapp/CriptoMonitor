-- ═══════════════════════════════════════════════════════════════════════════
-- 050_macro_global.sql — Maré de liquidez macro (FRED, market-wide)
--
-- Liquidez líquida do Fed (net liquidity = WALCL − Reverse Repo − TGA) + juros
-- reais (DFII10) e credit spread (HY) — a "maré" que move o ciclo cripto. Coletado
-- pela edge function `macro-fred` (FRED API, chave no app_secrets), cron diário.
-- Market-wide (sem asset). Lido pelo motor de confluência (gate macro) e MacroTab.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.macro_global (
  id                 bigserial   primary key,
  net_liquidity_busd numeric,                 -- liquidez líquida do Fed em BILHÕES USD
  nl_chg_30d_pct     numeric,                 -- variação 30d (%) — a direção da maré
  walcl              numeric,                 -- Fed total assets (componente)
  rrp                numeric,                 -- overnight reverse repo (componente)
  tga                numeric,                 -- Treasury General Account (componente)
  real_yield_10y     numeric,                 -- DFII10 (juros reais 10y)
  hy_spread          numeric,                 -- BAMLH0A0HYM2 (high-yield spread)
  nfci               numeric,                 -- Chicago Fed Nat'l Financial Conditions (composto)
  yield_curve        numeric,                 -- T10Y2Y (2s10s)
  m2                 numeric,                 -- WM2NS (massa monetária M2)
  source             text        not null default 'fred',
  ts                 timestamptz not null default now()
);
create index if not exists idx_macro_global_ts on public.macro_global(ts desc);

alter table public.macro_global enable row level security;
-- Pro+ (também útil na aba Macro; o módulo de confluência é Expert).
drop policy if exists macro_global_select on public.macro_global;
create policy macro_global_select on public.macro_global
  for select to authenticated using (public.plan_is_advanced());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='macro_global'
  ) then
    alter publication supabase_realtime add table public.macro_global;
  end if;
end $$;
