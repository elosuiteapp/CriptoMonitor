-- ═══════════════════════════════════════════════════════════════════════════
-- 029_admin_panel_v2.sql — Painel admin v2 (dual-currency, gateways, CRM)
-- · admin_overview     → + MRR/ARR em USD, distribuição por gateway, preços nos planos
-- · admin_update_plan  → + price_usd_cents e paddle_price_id (edição dual-currency)
-- · admin_user_detail  → + cpf no perfil e gateway nas assinaturas
-- · admin_list_users   → + cpf e gateway (para CRM / exportação CSV)
-- Mantém o modelo de segurança do 019 (SECURITY DEFINER + guard is_admin()).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── admin_overview v2 (mesmo retorno jsonb; corpo estendido) ─────────────────
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
    'mrr_usd_cents',     (select coalesce(sum(p.price_usd_cents), 0) from public.subscriptions s join public.plans p on p.id = s.plan_id where s.status = 'active'),
    'arr_usd_cents',     (select coalesce(sum(p.price_usd_cents), 0) * 12 from public.subscriptions s join public.plans p on p.id = s.plan_id where s.status = 'active'),
    'ai_today',          (select count(*) from public.ai_analysis where created_at >= date_trunc('day', now())),
    'ai_30d',            (select count(*) from public.ai_analysis where created_at > now() - interval '30 days'),
    'ai_total',          (select count(*) from public.ai_analysis),
    'alerts_active',     (select count(*) from public.alerts where active),
    'plan_distribution', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'slug', slug, 'name', name, 'count', cnt,
               'mrr_cents', mrr, 'price_cents', price_cents, 'price_usd_cents', price_usd_cents
             ) order by sort_order), '[]'::jsonb)
      from (
        select p.slug, p.name, p.sort_order, p.price_cents, p.price_usd_cents,
               count(s.id) as cnt,
               coalesce(sum(case when s.id is not null then p.price_cents else 0 end), 0) as mrr
        from public.plans p
        left join public.subscriptions s on s.plan_id = p.id and s.status = 'active'
        group by p.slug, p.name, p.sort_order, p.price_cents, p.price_usd_cents
      ) d
    ),
    'gateway_distribution', (
      select coalesce(jsonb_agg(jsonb_build_object('gateway', g, 'count', c, 'mrr_cents', mrr) order by c desc), '[]'::jsonb)
      from (
        select coalesce(nullif(s.gateway, ''), 'manual') as g,
               count(*) as c,
               coalesce(sum(p.price_cents), 0) as mrr
        from public.subscriptions s join public.plans p on p.id = s.plan_id
        where s.status = 'active' and p.price_cents > 0
        group by coalesce(nullif(s.gateway, ''), 'manual')
      ) d
    )
  ) into r;
  return r;
end;
$$;

-- ─── admin_update_plan v3 (+ price_usd_cents, paddle_price_id) ─────────────────
drop function if exists public.admin_update_plan(text, text, int, text[], int, boolean, boolean, boolean, int, text, text[], int);

create or replace function public.admin_update_plan(
  p_slug text,
  p_name text,
  p_price_cents int,
  p_price_usd_cents int,
  p_paddle_price_id text,
  p_assets text[],
  p_snapshot_interval_min int,
  p_advanced boolean,
  p_chart_layers boolean,
  p_smart_money boolean,
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
    price_usd_cents       = p_price_usd_cents,
    paddle_price_id       = nullif(btrim(coalesce(p_paddle_price_id, '')), ''),
    assets                = p_assets,
    snapshot_interval_min = p_snapshot_interval_min,
    advanced_metrics      = p_advanced,
    chart_layers          = p_chart_layers,
    smart_money           = p_smart_money,
    ai_daily_limit        = p_ai_daily_limit,
    ai_model              = p_ai_model,
    alert_channels        = p_alert_channels,
    history_days          = p_history_days
  where slug = p_slug;
  if not found then raise exception 'plano % nao existe', p_slug; end if;
  perform public._admin_log('update_plan', 'plan', p_slug,
    jsonb_build_object('name', p_name, 'price_cents', p_price_cents, 'price_usd_cents', p_price_usd_cents,
                       'smart_money', p_smart_money, 'ai_model', p_ai_model));
end;
$$;

revoke all on function public.admin_update_plan(text, text, int, int, text, text[], int, boolean, boolean, boolean, int, text, text[], int) from public, anon;
grant execute on function public.admin_update_plan(text, text, int, int, text, text[], int, boolean, boolean, boolean, int, text, text[], int) to authenticated;

-- ─── admin_user_detail v2 (+ cpf no perfil, gateway nas assinaturas) ──────────
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
               p.full_name, p.phone, p.cpf, coalesce(p.role, 'user') as role
        from auth.users u left join public.profiles p on p.id = u.id
        where u.id = p_uid
      ) x
    ),
    'subscriptions', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb)
      from (
        select s.id, s.status, s.current_period_end, s.created_at, s.gateway,
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

-- ─── admin_list_users v2 (+ cpf, gateway) ────────────────────────────────────
drop function if exists public.admin_list_users(text, text, text, int, int);

create or replace function public.admin_list_users(
  p_search text default null,
  p_plan   text default null,
  p_status text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  id uuid, email text, full_name text, phone text, cpf text, role text,
  created_at timestamptz, last_sign_in_at timestamptz,
  plan_slug text, plan_name text, sub_status text, gateway text, current_period_end timestamptz,
  ai_30d bigint, alerts_active bigint, total_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with base as (
    select u.id, u.email::text as email, u.created_at, u.last_sign_in_at,
           p.full_name, p.phone, p.cpf, coalesce(p.role, 'user') as role,
           s.status as sub_status, s.gateway, s.current_period_end,
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
  select f.id, f.email, f.full_name, f.phone, f.cpf, f.role, f.created_at, f.last_sign_in_at,
         f.plan_slug, f.plan_name, f.sub_status, f.gateway, f.current_period_end,
         (select count(*) from public.ai_analysis a where a.user_id = f.id and a.created_at > now() - interval '30 days')::bigint,
         (select count(*) from public.alerts al where al.user_id = f.id and al.active)::bigint,
         (select count(*) from filtered)::bigint
  from filtered f
  order by f.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.admin_list_users(text, text, text, int, int) from public, anon;
grant execute on function public.admin_list_users(text, text, text, int, int) to authenticated;
