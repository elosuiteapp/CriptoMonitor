-- 039 — Newsletter automática: leitura livre, RPC com paywall, geração por IA (cron)
-- e painel admin. As tabelas newsletter_editions/newsletter_subscribers vêm da
-- migração "newsletter" anterior (aplicada via Supabase); este arquivo cobre as
-- mudanças desta sessão. Tudo idempotente (pode rodar de novo sem quebrar).

-- Leitura completa liberada para QUALQUER conta (decisão do dono): sem gating por plano.
update public.newsletter_editions set min_tier = 'free' where min_tier <> 'free';

-- Marca edições geradas pela IA (idempotência do cron semanal).
alter table public.newsletter_editions
  add column if not exists auto_generated boolean not null default false;

-- O painel admin lê auto_generated; sem o grant a lista falha silenciosamente
-- (body_md continua sem grant = paywall intacto).
grant select (auto_generated) on public.newsletter_editions to authenticated;

-- RPC: único caminho do body_md. Entrega o corpo só se o plano alcança o min_tier
-- (hoje todas as edições são free); senão locked=true e corpo null. Free<Pro<Expert.
create or replace function public.newsletter_full(p_slug text)
returns table (
  slug text, title text, excerpt text, body_md text,
  cover_emoji text, min_tier text, published_at timestamptz, locked boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_rank int;
begin
  v_rank := case coalesce(public.current_plan_slug(), 'free')
              when 'expert' then 3 when 'pro' then 2 else 1 end;
  return query
  select e.slug, e.title, e.excerpt,
         case when (case e.min_tier when 'expert' then 3 when 'pro' then 2 else 1 end) <= v_rank
              then e.body_md else null end,
         e.cover_emoji, e.min_tier, e.published_at,
         (case e.min_tier when 'expert' then 3 when 'pro' then 2 else 1 end) > v_rank
  from public.newsletter_editions e
  where e.slug = p_slug and e.published = true;
end;
$$;
revoke all on function public.newsletter_full(text) from public, anon;
grant execute on function public.newsletter_full(text) to authenticated;

-- Admin gerencia pelo /admin (ver rascunhos, publicar/despublicar, excluir).
drop policy if exists "admin_manage_newsletter" on public.newsletter_editions;
create policy "admin_manage_newsletter" on public.newsletter_editions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Segredo do cron (prova que a chamada veio do agendador). Lido só por service_role
-- (RLS sem policies). O cron passa no header x-cron-key; a função compara.
create table if not exists public.app_secrets (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
insert into public.app_secrets (key, value)
values ('newsletter_cron_key',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- Agendador
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Geração semanal: SEXTA 12:00 UTC (~9h BRT). A função (newsletter-generate)
-- publica automaticamente; manual pelo admin entra como rascunho (publish:false).
select cron.unschedule(jobid) from cron.job where jobname = 'newsletter-weekly';
select cron.schedule(
  'newsletter-weekly',
  '0 12 * * 5',
  $job$
  select net.http_post(
    url := 'https://gshdynwrvabasjiapyap.supabase.co/functions/v1/newsletter-generate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select value from public.app_secrets where key = 'newsletter_cron_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
