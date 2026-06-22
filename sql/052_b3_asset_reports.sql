-- Análises POR ATIVO da B3 (ação ou FII) geradas por IA. Módulo B3 = admin-only.
create table if not exists public.b3_asset_reports (
  id bigserial primary key,
  asset text not null,
  kind text,
  content text not null,
  model text,
  input_tokens int,
  output_tokens int,
  ts timestamptz not null default now()
);
create index if not exists idx_b3_asset_reports_asset_ts on public.b3_asset_reports (asset, ts desc);

alter table public.b3_asset_reports enable row level security;
drop policy if exists b3_asset_reports_select on public.b3_asset_reports;
create policy b3_asset_reports_select on public.b3_asset_reports for select to authenticated using (public.is_admin());
-- Escrita só pelo service role (edge b3-analysis); sem policy de insert para usuários.
