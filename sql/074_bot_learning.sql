-- 074 — Cérebro que aprende: guarda a avaliação de acerto por sinal (rotulada com o retorno
-- futuro ~1h de cada leitura) + o diagnóstico da IA. Uso pessoal/admin. Recomputado pela edge bot-learn.
create table if not exists public.bot_learning (
  id         int primary key default 1,
  data       jsonb,        -- {overall, perSignal:[...], byAsset, window, n}
  ai_report  text,         -- diagnóstico + sugestões (Gemini, PT)
  updated_at timestamptz not null default now()
);
alter table public.bot_learning enable row level security;
drop policy if exists bot_learning_read on public.bot_learning;
create policy bot_learning_read on public.bot_learning for select to authenticated using (public.is_admin());
insert into public.bot_learning (id) values (1) on conflict do nothing;
