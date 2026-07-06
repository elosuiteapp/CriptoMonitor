-- 108_admin_panel_fixes.sql — auditoria do painel /admin (06/jul, 3 agentes + verificação live):
-- (1) admin_list_users v4: o lateral join só considerava assinatura ATIVA → filtros "Em atraso"/
--     "Cancelada" SEMPRE retornavam 0 linhas (mortos). Agora pega a assinatura ativa se houver,
--     senão a mais recente de qualquer status → filtro funciona e usuário churnado mostra o plano
--     que tinha (CRM). MRR não passa por aqui (admin_overview segue intocado).
-- (2) admin_update_plan v4: o form/RPC ignoravam 4 colunas reais de plans (sql/078+053) →
--     admin NÃO conseguia editar preço ANUAL nem MÓDULOS dos planos vendáveis. Assinatura nova
--     com p_modules/p_*_annual/p_preview_layers; a v3 (14 args) é dropada.
-- (3) newsletter_full: exigia published=true → o botão "Ver" do admin quebrava no RASCUNHO
--     (exatamente o fluxo "revisar antes de publicar"). Admin agora enxerga rascunho.
-- PENDENTE (anotado, não corrigido aqui): fusos das agregações diárias do admin
-- (admin_overview "hoje", admin_signups/usage_timeseries, admin_ai_costs) são UTC — o "hoje"
-- vira às 21h BRT. Corrigir num passo próprio (America/Sao_Paulo), são 4 funções grandes.

-- (1) ─────────────────────────────────────────────────────────────────────────
create or replace function public.admin_list_users(p_search text default null, p_plan text default null, p_status text default null, p_role text default null, p_limit integer default 50, p_offset integer default 0)
returns table(id uuid, email text, full_name text, phone text, cpf text, role text, created_at timestamptz, last_sign_in_at timestamptz, plan_slug text, plan_name text, sub_status text, gateway text, current_period_end timestamptz, ai_30d bigint, alerts_active bigint, total_count bigint)
language plpgsql stable security definer set search_path to 'public' as $$
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
      where s2.user_id = u.id
      order by (s2.status = 'active') desc, s2.created_at desc
      limit 1
    ) s on true
    left join public.plans pl on pl.id = s.plan_id
  ),
  filtered as (
    select * from base b
    where (p_search is null or b.email ilike '%' || p_search || '%' or coalesce(b.full_name, '') ilike '%' || p_search || '%')
      and (p_plan   is null or b.plan_slug = p_plan)
      and (p_status is null or b.sub_status = p_status)
      and (p_role   is null or b.role = p_role)
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

-- (2) ─────────────────────────────────────────────────────────────────────────
drop function if exists public.admin_update_plan(text, text, integer, integer, text, text[], integer, boolean, boolean, boolean, integer, text, text[], integer);
create or replace function public.admin_update_plan(
  p_slug text, p_name text, p_price_cents integer, p_price_usd_cents integer,
  p_price_annual_cents integer, p_price_usd_annual_cents integer,
  p_paddle_price_id text, p_modules text[], p_assets text[], p_snapshot_interval_min integer,
  p_advanced boolean, p_chart_layers boolean, p_smart_money boolean,
  p_ai_daily_limit integer, p_ai_model text, p_alert_channels text[], p_history_days integer,
  p_preview_layers text[]
) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.plans set
    name                   = p_name,
    price_cents            = p_price_cents,
    price_usd_cents        = p_price_usd_cents,
    price_annual_cents     = coalesce(p_price_annual_cents, 0),
    price_usd_annual_cents = coalesce(p_price_usd_annual_cents, 0),
    paddle_price_id        = nullif(btrim(coalesce(p_paddle_price_id, '')), ''),
    modules                = coalesce(p_modules, '{}'),
    assets                 = p_assets,
    snapshot_interval_min  = p_snapshot_interval_min,
    advanced_metrics       = p_advanced,
    chart_layers           = p_chart_layers,
    smart_money            = p_smart_money,
    ai_daily_limit         = p_ai_daily_limit,
    ai_model               = p_ai_model,
    alert_channels         = p_alert_channels,
    history_days           = p_history_days,
    preview_layers         = coalesce(p_preview_layers, '{}')
  where slug = p_slug;
  if not found then raise exception 'plano % nao existe', p_slug; end if;
  perform public._admin_log('update_plan', 'plan', p_slug,
    jsonb_build_object('name', p_name, 'price_cents', p_price_cents, 'price_usd_cents', p_price_usd_cents,
                       'modules', p_modules, 'smart_money', p_smart_money, 'ai_model', p_ai_model));
end;
$$;
revoke all on function public.admin_update_plan(text, text, integer, integer, integer, integer, text, text[], text[], integer, boolean, boolean, boolean, integer, text, text[], integer, text[]) from public, anon;
grant execute on function public.admin_update_plan(text, text, integer, integer, integer, integer, text, text[], text[], integer, boolean, boolean, boolean, integer, text, text[], integer, text[]) to authenticated;

-- (3) ─────────────────────────────────────────────────────────────────────────
create or replace function public.newsletter_full(p_slug text)
returns table(slug text, title text, excerpt text, body_md text, cover_emoji text, min_tier text, published_at timestamptz, locked boolean)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_rank int;
begin
  v_rank := case coalesce(public.current_plan_slug(), 'free')
              when 'expert' then 3 when 'pro' then 2 else 1 end;
  return query
  select e.slug, e.title, e.excerpt,
         case when public.is_admin() or (case e.min_tier when 'expert' then 3 when 'pro' then 2 else 1 end) <= v_rank
              then e.body_md else null end,
         e.cover_emoji, e.min_tier, e.published_at,
         not public.is_admin() and (case e.min_tier when 'expert' then 3 when 'pro' then 2 else 1 end) > v_rank
  from public.newsletter_editions e
  where e.slug = p_slug and (e.published = true or public.is_admin()); -- admin revisa RASCUNHO no botão "Ver"
end;
$$;
