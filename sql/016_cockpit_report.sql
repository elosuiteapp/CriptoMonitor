-- Cockpit Report (miolo): relatorios diarios por ativo gerados pela IA (Gemini),
-- broadcast (nao pertencem a um usuario). Cron/entrega ficam para etapa futura.
alter table public.ai_analysis
  add column if not exists report_type text not null default 'on_demand'
    check (report_type in ('on_demand', 'daily')),
  add column if not exists auto_generated boolean not null default false;

-- relatorio broadcast nao tem dono (user_id null). Ja e nullable; garante.
alter table public.ai_analysis alter column user_id drop not null;

create index if not exists idx_ai_analysis_report_type_ts
  on public.ai_analysis (report_type, asset, created_at desc);

-- Leitura dos relatorios diarios (user_id null): Pro+ ve todos; Free ve vitrine (>7 dias).
-- Soma-se (OR) a policy existente "ai_analysis_select" (user_id = auth.uid()).
drop policy if exists ai_analysis_reports_select on public.ai_analysis;
create policy ai_analysis_reports_select on public.ai_analysis
  for select
  using (
    report_type = 'daily' and auto_generated = true and (
      plan_is_advanced() or created_at < now() - interval '7 days'
    )
  );
