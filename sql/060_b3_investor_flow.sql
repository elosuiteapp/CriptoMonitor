-- Fluxo de investimento na B3 por tipo de investidor (estrangeiro/institucional/PF/
-- inst. financeira/outros), saldo diário em R$ milhões. Market-wide (não por ação).
-- O diferencial do TradeMap. Fonte: dadosdemercado (scraping leve no coletor b3_flow).
create table if not exists public.b3_investor_flow (
  date date primary key,
  foreign_mi numeric,
  institutional_mi numeric,
  retail_mi numeric,
  financial_mi numeric,
  other_mi numeric,
  ts timestamptz not null default now()
);
alter table public.b3_investor_flow enable row level security;
drop policy if exists b3_investor_flow_select on public.b3_investor_flow;
create policy b3_investor_flow_select on public.b3_investor_flow for select to authenticated using (true);
comment on table public.b3_investor_flow is 'Fluxo diario de investimento na B3 por tipo (R$ milhoes). Fonte: dadosdemercado. Market-wide.';
