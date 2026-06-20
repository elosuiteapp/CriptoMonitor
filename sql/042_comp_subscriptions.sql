-- ═══════════════════════════════════════════════════════════════════════════
-- 042_comp_subscriptions.sql — Assinaturas CORTESIA (comp) que NÃO contam receita
-- OrbeView
--
-- Problema: admin_set_subscription cria assinaturas manuais (gateway NULL) que
-- entram no MRR/ARPU/receita exatamente como uma venda real. Assim, dar Expert
-- ao próprio admin, a um afiliado ou à equipe poluía a conferência de faturamento.
--
-- Solução: marcar a assinatura como CORTESIA (subscriptions.comp = true) com um
-- motivo (admin/afiliado/equipe/parceiro/outro). Cortesias dão acesso completo
-- ao plano, mas são EXCLUÍDAS de MRR, ARR, ARPU, pagantes e quebra por
-- plano/gateway. O painel mostra um total separado "cortesias ativas".
--
-- Aditivo e seguro: assinaturas reais (webhook Asaas/Paddle) seguem comp=false.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Colunas de cortesia ─────────────────────────────────────────────────────
alter table public.subscriptions add column if not exists comp boolean not null default false;
alter table public.subscriptions add column if not exists comp_reason text;
alter table public.subscriptions drop constraint if exists subscriptions_comp_reason_check;
alter table public.subscriptions add constraint subscriptions_comp_reason_check
  check (comp_reason is null or comp_reason in ('admin', 'affiliate', 'team', 'partner', 'other'));
comment on column public.subscriptions.comp is 'cortesia: acesso liberado sem cobrança; NÃO entra no MRR/receita';
comment on column public.subscriptions.comp_reason is 'admin | affiliate | team | partner | other';

-- ═══════════════════════════════════════════════════════════════════════════
-- admin_set_subscription v2 — + cortesia (p_comp, p_comp_reason)
-- A assinatura de 4 args é substituída pela de 6 (defaults preservam chamadas antigas).
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.admin_set_subscription(uuid, text, text, timestamptz);

create or replace function public.admin_set_subscription(
  p_uid         uuid,
  p_plan_slug   text,
  p_status      text        default 'active',
  p_period_end  timestamptz default null,
  p_comp        boolean     default false,
  p_comp_reason text        default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_plan_id uuid; v_reason text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active', 'canceled', 'past_due') then raise exception 'status invalido: %', p_status; end if;
  select id into v_plan_id from public.plans where slug = p_plan_slug;
  if v_plan_id is null then raise exception 'plano % nao existe', p_plan_slug; end if;
  -- só cortesias guardam motivo; default 'other' se marcada sem motivo explícito
  v_reason := case when p_comp then coalesce(nullif(trim(coalesce(p_comp_reason, '')), ''), 'other') else null end;

  if p_status = 'active' then
    -- encerra a assinatura ativa atual (respeita o índice único de ativo) e cria a nova
    update public.subscriptions set status = 'canceled', updated_at = now()
      where user_id = p_uid and status = 'active';
    insert into public.subscriptions (user_id, plan_id, status, current_period_end, comp, comp_reason)
      values (p_uid, v_plan_id, 'active', p_period_end, p_comp, v_reason);
  else
    update public.subscriptions
      set status = p_status, plan_id = v_plan_id, current_period_end = p_period_end,
          comp = p_comp, comp_reason = v_reason, updated_at = now()
      where user_id = p_uid and status = 'active';
    if not found then
      insert into public.subscriptions (user_id, plan_id, status, current_period_end, comp, comp_reason)
      values (p_uid, v_plan_id, p_status, p_period_end, p_comp, v_reason);
    end if;
  end if;
  perform public._admin_log('set_subscription', 'user', p_uid::text,
    jsonb_build_object('plan', p_plan_slug, 'status', p_status, 'period_end', p_period_end,
                       'comp', p_comp, 'comp_reason', v_reason));
end;
$$;

revoke all on function public.admin_set_subscription(uuid, text, text, timestamptz, boolean, text) from public, anon;
grant execute on function public.admin_set_subscription(uuid, text, text, timestamptz, boolean, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- admin_overview v3 — receita EXCLUI cortesias; expõe total de cortesias
-- ═══════════════════════════════════════════════════════════════════════════
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
                            where s.status = 'active' and p.price_cents > 0 and not s.comp),
    'subs_canceled',     (select count(*) from public.subscriptions where status = 'canceled'),
    'subs_canceled_30d', (select count(*) from public.subscriptions where status = 'canceled' and updated_at > now() - interval '30 days'),
    'subs_past_due',     (select count(*) from public.subscriptions where status = 'past_due'),
    -- cortesias ativas em planos pagos (acesso liberado, fora da receita)
    'comp_active',       (select count(*) from public.subscriptions s join public.plans p on p.id = s.plan_id
                            where s.status = 'active' and p.price_cents > 0 and s.comp),
    'comp_value_cents',  (select coalesce(sum(p.price_cents), 0) from public.subscriptions s join public.plans p on p.id = s.plan_id
                            where s.status = 'active' and s.comp),
    'mrr_cents',         (select coalesce(sum(p.price_cents), 0)      from public.subscriptions s join public.plans p on p.id = s.plan_id where s.status = 'active' and not s.comp),
    'arr_cents',         (select coalesce(sum(p.price_cents), 0) * 12 from public.subscriptions s join public.plans p on p.id = s.plan_id where s.status = 'active' and not s.comp),
    'mrr_usd_cents',     (select coalesce(sum(p.price_usd_cents), 0)      from public.subscriptions s join public.plans p on p.id = s.plan_id where s.status = 'active' and not s.comp),
    'arr_usd_cents',     (select coalesce(sum(p.price_usd_cents), 0) * 12 from public.subscriptions s join public.plans p on p.id = s.plan_id where s.status = 'active' and not s.comp),
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
        left join public.subscriptions s on s.plan_id = p.id and s.status = 'active' and not s.comp
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
        where s.status = 'active' and p.price_cents > 0 and not s.comp
        group by coalesce(nullif(s.gateway, ''), 'manual')
      ) d
    )
  ) into r;
  return r;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- admin_user_detail v3 — + comp/comp_reason nas assinaturas
-- ═══════════════════════════════════════════════════════════════════════════
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
               s.gateway_customer_id, s.gateway_subscription_id, s.comp, s.comp_reason,
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

-- ═══════════════════════════════════════════════════════════════════════════
-- AFILIADOS — concessão de cortesia em 1 clique
-- · admin_list_affiliates v2 expõe a conta vinculada (por user_id ou e-mail) e
--   se ela já tem cortesia ativa, para o botão na UI.
-- · admin_set_affiliate_comp concede/remove cortesia ao usuário do afiliado.
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.admin_list_affiliates();

create or replace function public.admin_list_affiliates()
returns table (
  id uuid, code text, name text, email text, pix_key text,
  commission_percent numeric, status text, created_at timestamptz,
  referred_total bigint, customers_active bigint,
  pending_cents bigint, paid_cents bigint, lifetime_cents bigint,
  account_user_id uuid, account_plan text, account_comp boolean
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with aff as (
    select a.*,
           coalesce(a.user_id, (select u.id from auth.users u where lower(u.email) = lower(a.email) limit 1)) as acct
    from public.affiliates a
  )
  select a.id, a.code, a.name, a.email, a.pix_key,
         a.commission_percent, a.status, a.created_at,
         (select count(*) from public.profiles pr where pr.referred_by_affiliate_id = a.id)::bigint,
         (select count(distinct s.user_id)
            from public.subscriptions s
            join public.profiles pr on pr.id = s.user_id
            join public.plans pl on pl.id = s.plan_id
           where pr.referred_by_affiliate_id = a.id and s.status = 'active' and pl.price_cents > 0)::bigint,
         coalesce((select sum(c.commission_amount_cents) from public.commissions c
                    where c.affiliate_id = a.id and c.status in ('pending', 'approved')), 0)::bigint,
         coalesce((select sum(c.commission_amount_cents) from public.commissions c
                    where c.affiliate_id = a.id and c.status = 'paid'), 0)::bigint,
         coalesce((select sum(c.commission_amount_cents) from public.commissions c
                    where c.affiliate_id = a.id and c.status <> 'reversed'), 0)::bigint,
         a.acct,
         (select pl.slug from public.subscriptions s join public.plans pl on pl.id = s.plan_id
            where s.user_id = a.acct and s.status = 'active' order by s.created_at desc limit 1),
         coalesce((select s.comp from public.subscriptions s
            where s.user_id = a.acct and s.status = 'active' order by s.created_at desc limit 1), false)
  from aff a
  order by a.created_at desc;
end;
$$;

-- Concede (p_grant=true) ou remove (false) cortesia para a CONTA do afiliado.
-- Vincula a conta por e-mail na primeira concessão (preenche affiliates.user_id).
create or replace function public.admin_set_affiliate_comp(
  p_affiliate_id uuid,
  p_grant        boolean default true,
  p_plan_slug    text    default 'expert'
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_user uuid; v_email text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select user_id, email into v_user, v_email from public.affiliates where id = p_affiliate_id;
  if not found then raise exception 'afiliado nao encontrado'; end if;

  -- sem vínculo direto: tenta achar a conta pelo e-mail do afiliado e fixa o vínculo
  if v_user is null and v_email is not null then
    select id into v_user from auth.users where lower(email) = lower(v_email) limit 1;
    if v_user is not null then
      update public.affiliates set user_id = v_user, updated_at = now() where id = p_affiliate_id;
    end if;
  end if;
  if v_user is null then
    raise exception 'o afiliado precisa ter conta no app com o e-mail cadastrado para receber cortesia';
  end if;

  if p_grant then
    perform public.admin_set_subscription(v_user, p_plan_slug, 'active', null, true, 'affiliate');
  else
    perform public.admin_set_subscription(v_user, 'free', 'canceled', null, false, null);
  end if;
  perform public._admin_log('set_affiliate_comp', 'affiliate', p_affiliate_id::text,
    jsonb_build_object('grant', p_grant, 'plan', p_plan_slug, 'user_id', v_user));
end;
$$;

-- ─── Privilégios ─────────────────────────────────────────────────────────────
revoke all on function public.admin_list_affiliates() from public, anon;
revoke all on function public.admin_set_affiliate_comp(uuid, boolean, text) from public, anon;
grant execute on function public.admin_list_affiliates() to authenticated;
grant execute on function public.admin_set_affiliate_comp(uuid, boolean, text) to authenticated;
