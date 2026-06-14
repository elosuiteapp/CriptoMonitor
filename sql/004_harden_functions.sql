-- ═══════════════════════════════════════════════════════════════════════════
-- 004_harden_functions.sql — Endurecimento das funções (security advisor)
-- Crypto Monitor
--
-- O advisor de segurança do Supabase alerta que funções SECURITY DEFINER ficam
-- expostas via /rest/v1/rpc. Os helpers de plano só precisam ler:
--   · subscriptions  → o usuário já lê a PRÓPRIA linha por RLS (003);
--   · plans          → catálogo público.
-- Logo, podem rodar como SECURITY INVOKER (privilégio do chamador) sem perder
-- nada — e deixam de ser apontados pelo advisor.
--
-- handle_new_user() PRECISA continuar SECURITY DEFINER (insere em profiles/
-- subscriptions durante o signup, contornando RLS). Mas restringimos quem pode
-- executá-la: apenas o role do GoTrue (supabase_auth_admin), via trigger.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Helpers de plano → SECURITY INVOKER ─────────────────────────────────────
create or replace function public.current_plan_slug()
returns text
language sql stable security invoker set search_path = public
as $$
  select coalesce(
    (select p.slug
       from public.subscriptions s
       join public.plans p on p.id = s.plan_id
      where s.user_id = auth.uid()
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
      order by p.sort_order desc
      limit 1),
    'free'
  );
$$;

create or replace function public.plan_assets()
returns text[]
language sql stable security invoker set search_path = public
as $$ select assets from public.plans where slug = public.current_plan_slug(); $$;

create or replace function public.plan_is_advanced()
returns boolean
language sql stable security invoker set search_path = public
as $$ select coalesce((select advanced_metrics from public.plans where slug = public.current_plan_slug()), false); $$;

create or replace function public.plan_snapshot_min()
returns int
language sql stable security invoker set search_path = public
as $$ select coalesce((select snapshot_interval_min from public.plans where slug = public.current_plan_slug()), 30); $$;

create or replace function public.plan_history_days()
returns int
language sql stable security invoker set search_path = public
as $$ select history_days from public.plans where slug = public.current_plan_slug(); $$;

create or replace function public.plan_alert_channels()
returns text[]
language sql stable security invoker set search_path = public
as $$ select coalesce((select alert_channels from public.plans where slug = public.current_plan_slug()), '{}'::text[]); $$;

create or replace function public.ts_within_history(check_ts timestamptz)
returns boolean
language sql stable security invoker set search_path = public
as $$
  select case
    when public.plan_history_days() is null then true
    else check_ts > now() - make_interval(days => public.plan_history_days())
  end;
$$;

create or replace function public.ts_within_frequency(check_ts timestamptz)
returns boolean
language sql stable security invoker set search_path = public
as $$
  select public.plan_snapshot_min() <= 5
      or (extract(minute from check_ts)::int % 30 = 0);
$$;

-- ─── handle_new_user(): mantém DEFINER, restringe execução ao GoTrue ─────────
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant  execute on function public.handle_new_user() to supabase_auth_admin;
