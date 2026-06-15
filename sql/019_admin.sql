-- ═══════════════════════════════════════════════════════════════════════════
-- 019_admin.sql — Painel de administrador do SaaS (RBAC + métricas + ações)
-- Crypto Monitor
--
-- Modelo de segurança:
--   · Papel `admin` fica em profiles.role. Helper is_admin() (SECURITY DEFINER).
--   · TODO dado sensível do painel (incl. e-mails de auth.users) sai apenas por
--     funções SECURITY DEFINER guardadas por is_admin() — nunca por RLS aberta.
--   · Mutações do admin (papel, assinatura, plano) passam por funções que
--     registram no admin_audit_log. Nenhuma tabela de negócio ganha grant novo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Papel de administrador em profiles ──────────────────────────────────────
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'admin'));

-- ─── Helper central: o usuário logado é admin? ───────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false); $$;
-- is_admin() só para authenticated (a policy do admin_audit_log usa); nunca anon.
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ─── Trilha de auditoria das ações de admin ──────────────────────────────────
create table if not exists public.admin_audit_log (
  id          bigint generated always as identity primary key,
  admin_id    uuid        references auth.users (id) on delete set null,
  admin_email text,
  action      text        not null,           -- 'set_role' | 'set_subscription' | 'update_plan'
  target_type text,                            -- 'user' | 'plan' | ...
  target_id   text,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_admin_audit_created on public.admin_audit_log (created_at desc);

grant select on public.admin_audit_log to authenticated;
alter table public.admin_audit_log enable row level security;
drop policy if exists admin_audit_select on public.admin_audit_log;
create policy admin_audit_select on public.admin_audit_log for select to authenticated
using (public.is_admin());

-- Logger interno (não exposto ao cliente).
create or replace function public._admin_log(p_action text, p_target_type text, p_target_id text, p_detail jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.admin_audit_log (admin_id, admin_email, action, target_type, target_id, detail)
  values (
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    p_action, p_target_type, p_target_id, p_detail
  );
end;
$$;
revoke all on function public._admin_log(text, text, text, jsonb) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- LEITURAS — todas guardadas por is_admin() e SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Visão geral (KPIs do negócio) ───────────────────────────────────────────
create or replace function public.admin_overview()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'users_total',       (select count(*) from auth.users),
    'users_today',       (select count(*) from auth.users where created_at >= date_trunc('day', now())),
    'users_7d',          (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'users_30d',         (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'subs_active',       (select count(*) from public.subscriptions where status = 'active'),
    'subs_paid_active',  (select count(*) from public.subscriptions s join public.plans p on p.id = s.plan_id
                            where s.status = 'active' and p.price_cents > 0),
    'subs_canceled',     (select count(*) from public.subscriptions where status = 'canceled'),
    'subs_canceled_30d', (select count(*) from public.subscriptions where status = 'canceled' and updated_at > now() - interval '30 days'),
    'subs_past_due',     (select count(*) from public.subscriptions where status = 'past_due'),
    'mrr_cents',         (select coalesce(sum(p.price_cents), 0) from public.subscriptions s join public.plans p on p.id = s.plan_id where s.status = 'active'),
    'arr_cents',         (select coalesce(sum(p.price_cents), 0) * 12 from public.subscriptions s join public.plans p on p.id = s.plan_id where s.status = 'active'),
    'ai_today',          (select count(*) from public.ai_analysis where created_at >= date_trunc('day', now())),
    'ai_30d',            (select count(*) from public.ai_analysis where created_at > now() - interval '30 days'),
    'ai_total',          (select count(*) from public.ai_analysis),
    'alerts_active',     (select count(*) from public.alerts where active),
    'plan_distribution', (
      select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'count', cnt, 'mrr_cents', mrr) order by sort_order), '[]'::jsonb)
      from (
        select p.slug, p.name, p.sort_order,
               count(s.id) as cnt,
               coalesce(sum(case when s.id is not null then p.price_cents else 0 end), 0) as mrr
        from public.plans p
        left join public.subscriptions s on s.plan_id = p.id and s.status = 'active'
        group by p.slug, p.name, p.sort_order
      ) d
    )
  ) into r;
  return r;
end;
$$;

-- ─── Série temporal de cadastros (signups por dia + acumulado) ────────────────
create or replace function public.admin_signups_timeseries(p_days int default 30)
returns table (day date, signups bigint, cumulative bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with days as (
    select generate_series(date_trunc('day', now()) - make_interval(days => p_days - 1),
                           date_trunc('day', now()), interval '1 day')::date as d
  ),
  per as (
    select date_trunc('day', created_at)::date as d, count(*) as c from auth.users group by 1
  ),
  prior_count as (
    select count(*) as c from auth.users where created_at < (select min(d) from days)
  )
  select dd.d,
         coalesce(per.c, 0)::bigint as signups,
         ((select c from prior_count) + sum(coalesce(per.c, 0)) over (order by dd.d))::bigint as cumulative
  from days dd
  left join per on per.d = dd.d
  order by dd.d;
end;
$$;

-- ─── Série temporal de uso de IA (análises por dia) ──────────────────────────
create or replace function public.admin_usage_timeseries(p_days int default 30)
returns table (day date, analyses bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with days as (
    select generate_series(date_trunc('day', now()) - make_interval(days => p_days - 1),
                           date_trunc('day', now()), interval '1 day')::date as d
  ),
  per as (
    select created_at::date as d, count(*) as c from public.ai_analysis group by 1
  )
  select dd.d, coalesce(per.c, 0)::bigint as analyses
  from days dd left join per on per.d = dd.d
  order by dd.d;
end;
$$;

-- ─── Uso de IA por modelo ────────────────────────────────────────────────────
create or replace function public.admin_usage_by_model()
returns table (model_used text, analyses bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select a.model_used, count(*)::bigint
  from public.ai_analysis a
  group by a.model_used
  order by 2 desc;
end;
$$;

-- ─── Lista paginada de usuários (com e-mail, plano e contadores) ──────────────
create or replace function public.admin_list_users(
  p_search text default null,
  p_plan   text default null,
  p_status text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  id uuid, email text, full_name text, phone text, role text,
  created_at timestamptz, last_sign_in_at timestamptz,
  plan_slug text, plan_name text, sub_status text, current_period_end timestamptz,
  ai_30d bigint, alerts_active bigint, total_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with base as (
    select u.id, u.email::text as email, u.created_at, u.last_sign_in_at,
           p.full_name, p.phone, coalesce(p.role, 'user') as role,
           s.status as sub_status, s.current_period_end,
           pl.slug as plan_slug, pl.name as plan_name
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join lateral (
      select s2.* from public.subscriptions s2
      where s2.user_id = u.id and s2.status = 'active'
      order by s2.created_at desc limit 1
    ) s on true
    left join public.plans pl on pl.id = s.plan_id
  ),
  filtered as (
    select * from base b
    where (p_search is null or b.email ilike '%' || p_search || '%' or coalesce(b.full_name, '') ilike '%' || p_search || '%')
      and (p_plan   is null or b.plan_slug = p_plan)
      and (p_status is null or b.sub_status = p_status)
  )
  select f.id, f.email, f.full_name, f.phone, f.role, f.created_at, f.last_sign_in_at,
         f.plan_slug, f.plan_name, f.sub_status, f.current_period_end,
         (select count(*) from public.ai_analysis a where a.user_id = f.id and a.created_at > now() - interval '30 days')::bigint,
         (select count(*) from public.alerts al where al.user_id = f.id and al.active)::bigint,
         (select count(*) from filtered)::bigint
  from filtered f
  order by f.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
end;
$$;

-- ─── Detalhe completo de um usuário ──────────────────────────────────────────
create or replace function public.admin_user_detail(p_uid uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'profile', (
      select to_jsonb(x) from (
        select u.id, u.email, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
               p.full_name, p.phone, coalesce(p.role, 'user') as role
        from auth.users u left join public.profiles p on p.id = u.id
        where u.id = p_uid
      ) x
    ),
    'subscriptions', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb)
      from (
        select s.id, s.status, s.current_period_end, s.created_at,
               s.gateway_customer_id, s.gateway_subscription_id,
               pl.slug as plan_slug, pl.name as plan_name, pl.price_cents
        from public.subscriptions s join public.plans pl on pl.id = s.plan_id
        where s.user_id = p_uid
      ) s
    ),
    'alerts', (
      select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
      from (select id, asset, metric, condition, channel, active, created_at from public.alerts where user_id = p_uid) a
    ),
    'recent_analyses', (
      select coalesce(jsonb_agg(to_jsonb(an) order by an.created_at desc), '[]'::jsonb)
      from (
        select id, asset, model_used, report_type, created_at, left(content, 280) as preview
        from public.ai_analysis where user_id = p_uid order by created_at desc limit 20
      ) an
    ),
    'usage_30d', (select coalesce(sum(count), 0) from public.usage_log where user_id = p_uid and day > (now() - interval '30 days')::date),
    'ai_total',  (select count(*) from public.ai_analysis where user_id = p_uid)
  ) into result;
  if result -> 'profile' is null then raise exception 'usuario nao encontrado'; end if;
  return result;
end;
$$;

-- ─── Saúde do pipeline de dados (frescor + volume por fonte) ──────────────────
create or replace function public.admin_data_health()
returns table (source text, last_ts timestamptz, age_min numeric, row_count bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with h as (
    select 'prices_cex'       as source, (select max(ts) from public.prices_cex)       as last_ts, (select count(*) from public.prices_cex)       as n
    union all select 'derivatives',      (select max(ts) from public.derivatives),      (select count(*) from public.derivatives)
    union all select 'options_oi',       (select max(ts) from public.options_oi),       (select count(*) from public.options_oi)
    union all select 'gamma_profile',    (select max(ts) from public.gamma_profile),    (select count(*) from public.gamma_profile)
    union all select 'onchain_perps',    (select max(ts) from public.onchain_perps),    (select count(*) from public.onchain_perps)
    union all select 'macro',            (select max(ts) from public.macro),            (select count(*) from public.macro)
    union all select 'macro_assets',     (select max(ts) from public.macro_assets),     (select count(*) from public.macro_assets)
    union all select 'macro_correlations',(select max(ts) from public.macro_correlations),(select count(*) from public.macro_correlations)
    union all select 'dex_liquidity',    (select max(ts) from public.dex_liquidity),    (select count(*) from public.dex_liquidity)
    union all select 'defi_health',      (select max(ts) from public.defi_health),      (select count(*) from public.defi_health)
    union all select 'sentiment',        (select max(ts) from public.sentiment),        (select count(*) from public.sentiment)
    union all select 'orderbook_walls',  (select max(ts) from public.orderbook_walls),  (select count(*) from public.orderbook_walls)
    union all select 'options_flow',     (select max(ts) from public.options_flow),     (select count(*) from public.options_flow)
    union all select 'volatility_index', (select max(ts) from public.volatility_index), (select count(*) from public.volatility_index)
    union all select 'liquidations',     (select max(ts) from public.liquidations),     (select count(*) from public.liquidations)
    union all select 'news_feed',        (select max(ts) from public.news_feed),        (select count(*) from public.news_feed)
    union all select 'market_snapshot',  (select max(ts) from public.market_snapshot),  (select count(*) from public.market_snapshot)
  )
  select h.source, h.last_ts,
         round(extract(epoch from (now() - h.last_ts)) / 60.0, 1) as age_min,
         h.n::bigint
  from h order by h.source;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- MUTAÇÕES — guardadas por is_admin(); cada uma registra no audit log.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Promover / rebaixar usuário ─────────────────────────────────────────────
create or replace function public.admin_set_user_role(p_uid uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('user', 'admin') then raise exception 'papel invalido: %', p_role; end if;
  if p_role = 'user' and p_uid = auth.uid() then
    raise exception 'voce nao pode remover o proprio acesso de admin';
  end if;
  insert into public.profiles (id, role) values (p_uid, p_role)
  on conflict (id) do update set role = excluded.role, updated_at = now();
  perform public._admin_log('set_role', 'user', p_uid::text, jsonb_build_object('role', p_role));
end;
$$;

-- ─── Atribuir / alterar assinatura manualmente ───────────────────────────────
create or replace function public.admin_set_subscription(
  p_uid uuid, p_plan_slug text, p_status text default 'active', p_period_end timestamptz default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_plan_id uuid;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active', 'canceled', 'past_due') then raise exception 'status invalido: %', p_status; end if;
  select id into v_plan_id from public.plans where slug = p_plan_slug;
  if v_plan_id is null then raise exception 'plano % nao existe', p_plan_slug; end if;

  if p_status = 'active' then
    -- encerra a assinatura ativa atual (respeita o índice único de ativo) e cria a nova
    update public.subscriptions set status = 'canceled', updated_at = now()
      where user_id = p_uid and status = 'active';
    insert into public.subscriptions (user_id, plan_id, status, current_period_end)
      values (p_uid, v_plan_id, 'active', p_period_end);
  else
    update public.subscriptions
      set status = p_status, plan_id = v_plan_id, current_period_end = p_period_end, updated_at = now()
      where user_id = p_uid and status = 'active';
    if not found then
      insert into public.subscriptions (user_id, plan_id, status, current_period_end)
      values (p_uid, v_plan_id, p_status, p_period_end);
    end if;
  end if;
  perform public._admin_log('set_subscription', 'user', p_uid::text,
    jsonb_build_object('plan', p_plan_slug, 'status', p_status, 'period_end', p_period_end));
end;
$$;

-- ─── Editar parâmetros de um plano ───────────────────────────────────────────
create or replace function public.admin_update_plan(
  p_slug text,
  p_name text,
  p_price_cents int,
  p_assets text[],
  p_snapshot_interval_min int,
  p_advanced boolean,
  p_chart_layers boolean,
  p_ai_daily_limit int,
  p_ai_model text,
  p_alert_channels text[],
  p_history_days int
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.plans set
    name                  = p_name,
    price_cents           = p_price_cents,
    assets                = p_assets,
    snapshot_interval_min = p_snapshot_interval_min,
    advanced_metrics      = p_advanced,
    chart_layers          = p_chart_layers,
    ai_daily_limit        = p_ai_daily_limit,
    ai_model              = p_ai_model,
    alert_channels        = p_alert_channels,
    history_days          = p_history_days
  where slug = p_slug;
  if not found then raise exception 'plano % nao existe', p_slug; end if;
  perform public._admin_log('update_plan', 'plan', p_slug,
    jsonb_build_object('name', p_name, 'price_cents', p_price_cents, 'assets', p_assets, 'ai_model', p_ai_model));
end;
$$;

-- ─── Privilégios de execução: somente authenticated (o guard interno barra não-admins) ─
revoke all on function
  public.admin_overview(),
  public.admin_signups_timeseries(int),
  public.admin_usage_timeseries(int),
  public.admin_usage_by_model(),
  public.admin_list_users(text, text, text, int, int),
  public.admin_user_detail(uuid),
  public.admin_data_health(),
  public.admin_set_user_role(uuid, text),
  public.admin_set_subscription(uuid, text, text, timestamptz),
  public.admin_update_plan(text, text, int, text[], int, boolean, boolean, int, text, text[], int)
from public, anon;

grant execute on function
  public.admin_overview(),
  public.admin_signups_timeseries(int),
  public.admin_usage_timeseries(int),
  public.admin_usage_by_model(),
  public.admin_list_users(text, text, text, int, int),
  public.admin_user_detail(uuid),
  public.admin_data_health(),
  public.admin_set_user_role(uuid, text),
  public.admin_set_subscription(uuid, text, text, timestamptz),
  public.admin_update_plan(text, text, int, text[], int, boolean, boolean, int, text, text[], int)
to authenticated;

-- ─── Bootstrap: promove a conta do dono a admin ──────────────────────────────
-- Troque o e-mail abaixo se o admin inicial for outra conta. Depois disso, a
-- gestão de papéis é feita pela própria UI (Usuários → Tornar admin).
insert into public.profiles (id, role)
select u.id, 'admin' from auth.users u where lower(u.email) = 'mblongo81@gmail.com'
on conflict (id) do update set role = 'admin', updated_at = now();
