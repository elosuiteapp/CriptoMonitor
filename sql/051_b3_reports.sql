-- Relatórios diários do pregão da B3 (gerados por IA). Módulo B3 = admin-only.
create table if not exists public.b3_reports (
  id bigserial primary key,
  content text not null,
  model text,
  input_tokens int,
  output_tokens int,
  ts timestamptz not null default now()
);
create index if not exists idx_b3_reports_ts on public.b3_reports (ts desc);

alter table public.b3_reports enable row level security;
drop policy if exists b3_reports_select on public.b3_reports;
create policy b3_reports_select on public.b3_reports for select to authenticated using (public.is_admin());
-- Escrita só pelo service role (edge b3-report); sem policy de insert para usuários.
