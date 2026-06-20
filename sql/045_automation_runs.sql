-- ═══════════════════════════════════════════════════════════════════════════
-- 045_automation_runs.sql — Observabilidade das automações (Newsletter / Social)
-- OrbeView
--
-- Tabela única de execuções: cada disparo (cron ou manual) de newsletter-generate
-- e social-post grava uma linha (ok/error/skipped + modelo + detalhe). O admin
-- enxerga falhas silenciosas (cron que não rodou, erro de publicação) no painel.
-- Leitura só para admin (RLS); escrita pelas edge functions via service_role.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.automation_runs (
  id         bigint generated always as identity primary key,
  job        text        not null,                 -- 'newsletter' | 'social'
  status     text        not null check (status in ('ok', 'error', 'skipped')),
  model      text,                                  -- modelo Gemini usado (quando houve geração)
  detail     jsonb,                                 -- { error?, slug?, posted_x?, in_tokens?, ... }
  created_at timestamptz not null default now()
);
create index if not exists idx_automation_runs_job on public.automation_runs (job, created_at desc);

grant select on public.automation_runs to authenticated;
alter table public.automation_runs enable row level security;
drop policy if exists automation_runs_select on public.automation_runs;
create policy automation_runs_select on public.automation_runs for select to authenticated
using (public.is_admin());

-- Auditar qual modelo gerou cada edição da newsletter.
alter table public.newsletter_editions add column if not exists model_used text;
