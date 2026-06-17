-- ═══════════════════════════════════════════════════════════════════════════
-- 030_affiliates.sql — Programa de afiliados (indicação → comissão recorrente)
-- Crypto Monitor
--
-- Modelo de negócio (mercado nacional / Asaas / BRL):
--   · Admin cadastra afiliados no /admin; cada um recebe um CÓDIGO (ex: MARCOS10).
--   · Visitante chega por  ...com/?ref=MARCOS10  → ao logar, o código é vinculado
--     ao seu perfil (primeira atribuição, não sobrescreve).
--   · Cada PAGAMENTO confirmado de um indicado gera uma linha em `commissions`
--     (comissão RECORRENTE: toda mensalidade paga rende). Idempotente por pagamento.
--   · Pagamento ao afiliado é MANUAL (Pix): o admin confere o saldo e marca "pago".
--
-- Segurança: tabelas com RLS habilitada e SEM policies → invisíveis ao cliente.
-- Todo acesso passa por funções SECURITY DEFINER (admin) ou pelo service_role
-- (webhook). Mutações de admin são registradas no admin_audit_log.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── affiliates — quem pode vender (entidade própria; não precisa ser usuário) ─
create table if not exists public.affiliates (
  id                 uuid          primary key default gen_random_uuid(),
  user_id            uuid          references auth.users (id) on delete set null, -- vínculo opcional p/ futuro login
  code               text          not null,                 -- código de indicação (case-insensitive)
  name               text          not null,
  email              text,
  pix_key            text,                                   -- chave Pix para o repasse manual
  commission_percent numeric(5,2)  not null default 20,      -- % sobre cada pagamento do indicado
  status             text          not null default 'active' check (status in ('active', 'disabled')),
  notes              text,
  created_at         timestamptz   not null default now(),
  updated_at         timestamptz   not null default now()
);
-- Código único ignorando caixa (MARCOS10 == marcos10).
create unique index if not exists uq_affiliates_code_lower on public.affiliates (lower(code));

alter table public.affiliates enable row level security;  -- sem policies: só definer/service_role

-- ─── profiles — de qual afiliado veio o cadastro (first-touch) ────────────────
alter table public.profiles
  add column if not exists referred_by_affiliate_id uuid references public.affiliates (id) on delete set null;
create index if not exists idx_profiles_referred_by on public.profiles (referred_by_affiliate_id);

-- ─── commissions — livro-razão: 1 linha por pagamento de indicado ─────────────
create table if not exists public.commissions (
  id                      uuid        primary key default gen_random_uuid(),
  affiliate_id            uuid        not null references public.affiliates (id) on delete cascade,
  user_id                 uuid        references auth.users (id) on delete set null,  -- o cliente indicado
  subscription_id         uuid        references public.subscriptions (id) on delete set null,
  gateway                 text        not null,               -- 'asaas' (hoje só nacional)
  payment_ref             text        not null,               -- id do pagamento no gateway (idempotência)
  gross_amount_cents      int         not null,               -- valor pago pelo cliente, em centavos
  currency                text        not null default 'BRL',
  commission_percent      numeric(5,2) not null,              -- % no momento do crédito (snapshot)
  commission_amount_cents int         not null,               -- comissão devida, em centavos
  status                  text        not null default 'pending'
                                      check (status in ('pending', 'approved', 'paid', 'reversed')),
  paid_at                 timestamptz,
  created_at              timestamptz not null default now()
);
-- Um pagamento credita no máximo uma vez (webhook pode reentregar).
create unique index if not exists uq_commissions_payment on public.commissions (gateway, payment_ref);
create index if not exists idx_commissions_affiliate on public.commissions (affiliate_id, status);

alter table public.commissions enable row level security;  -- sem policies: só definer/service_role

-- ═══════════════════════════════════════════════════════════════════════════
-- Vínculo do indicado — chamado pelo app (authenticated) logo após o login.
-- Primeira atribuição apenas: nunca sobrescreve, nunca permite auto-indicação.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.attach_referral(p_code text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_aff uuid; v_owner uuid;
begin
  if auth.uid() is null or coalesce(trim(p_code), '') = '' then return false; end if;

  select id, user_id into v_aff, v_owner
    from public.affiliates
   where lower(code) = lower(trim(p_code)) and status = 'active';
  if v_aff is null then return false; end if;
  if v_owner = auth.uid() then return false; end if;  -- afiliado não indica a si mesmo

  update public.profiles
     set referred_by_affiliate_id = v_aff, updated_at = now()
   where id = auth.uid()
     and referred_by_affiliate_id is null;            -- só primeira atribuição
  return found;
end;
$$;
revoke all on function public.attach_referral(text) from public, anon;
grant execute on function public.attach_referral(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Crédito de comissão — chamado pelo webhook (service_role) a cada pagamento.
-- Idempotente: se o pagamento já gerou comissão, não faz nada.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.record_commission(
  p_user_id         uuid,
  p_subscription_id uuid,
  p_gateway         text,
  p_payment_ref     text,
  p_gross_cents     int,
  p_currency        text default 'BRL'
)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_aff_id uuid; v_pct numeric(5,2);
begin
  if p_user_id is null or coalesce(p_payment_ref, '') = '' or coalesce(p_gross_cents, 0) <= 0 then
    return;
  end if;

  -- Indicado por um afiliado ATIVO?
  select a.id, a.commission_percent
    into v_aff_id, v_pct
    from public.profiles pr
    join public.affiliates a on a.id = pr.referred_by_affiliate_id
   where pr.id = p_user_id and a.status = 'active';
  if v_aff_id is null then return; end if;

  insert into public.commissions (
    affiliate_id, user_id, subscription_id, gateway, payment_ref,
    gross_amount_cents, currency, commission_percent, commission_amount_cents, status
  ) values (
    v_aff_id, p_user_id, p_subscription_id, p_gateway, p_payment_ref,
    p_gross_cents, coalesce(p_currency, 'BRL'), v_pct,
    round(p_gross_cents * v_pct / 100.0)::int, 'pending'
  )
  on conflict (gateway, payment_ref) do nothing;
end;
$$;
revoke all on function public.record_commission(uuid, uuid, text, text, int, text) from public, anon, authenticated;
grant execute on function public.record_commission(uuid, uuid, text, text, int, text) to service_role;

-- ─── Reversão por estorno — chamado pelo webhook em PAYMENT_REFUNDED ──────────
-- Reverte apenas comissões ainda não pagas (pending/approved). Se já foi paga,
-- fica para tratamento manual do admin (não dá para "des-pagar" um Pix sozinho).
create or replace function public.reverse_commission(p_gateway text, p_payment_ref text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(p_payment_ref, '') = '' then return; end if;
  update public.commissions
     set status = 'reversed'
   where gateway = p_gateway and payment_ref = p_payment_ref
     and status in ('pending', 'approved');
end;
$$;
revoke all on function public.reverse_commission(text, text) from public, anon, authenticated;
grant execute on function public.reverse_commission(text, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- LEITURAS DO ADMIN — guardadas por is_admin().
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Lista de afiliados com agregados (indicados, clientes ativos, saldos) ────
create or replace function public.admin_list_affiliates()
returns table (
  id uuid, code text, name text, email text, pix_key text,
  commission_percent numeric, status text, created_at timestamptz,
  referred_total bigint, customers_active bigint,
  pending_cents bigint, paid_cents bigint, lifetime_cents bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
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
                    where c.affiliate_id = a.id and c.status <> 'reversed'), 0)::bigint
  from public.affiliates a
  order by a.created_at desc;
end;
$$;

-- ─── Detalhe de um afiliado (indicados + comissões) ──────────────────────────
create or replace function public.admin_affiliate_detail(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'affiliate', (
      select to_jsonb(x) from (
        select a.id, a.code, a.name, a.email, a.pix_key, a.commission_percent,
               a.status, a.notes, a.created_at
        from public.affiliates a where a.id = p_id
      ) x
    ),
    'referrals', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb)
      from (
        select u.id, u.email::text as email, pr.full_name, u.created_at,
               pl.slug as plan_slug, s.status as sub_status
        from public.profiles pr
        join auth.users u on u.id = pr.id
        left join lateral (
          select s2.* from public.subscriptions s2
          where s2.user_id = pr.id and s2.status = 'active'
          order by s2.created_at desc limit 1
        ) s on true
        left join public.plans pl on pl.id = s.plan_id
        where pr.referred_by_affiliate_id = p_id
      ) r
    ),
    'commissions', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
      from (
        select cm.id, cm.created_at, cm.gross_amount_cents, cm.currency,
               cm.commission_percent, cm.commission_amount_cents, cm.status, cm.paid_at,
               u.email::text as customer_email
        from public.commissions cm
        left join auth.users u on u.id = cm.user_id
        where cm.affiliate_id = p_id
        order by cm.created_at desc limit 200
      ) c
    )
  ) into result;
  if result -> 'affiliate' is null then raise exception 'afiliado nao encontrado'; end if;
  return result;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- MUTAÇÕES DO ADMIN — guardadas por is_admin(); registram no audit log.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Criar afiliado ──────────────────────────────────────────────────────────
create or replace function public.admin_create_affiliate(
  p_name text, p_code text, p_email text default null,
  p_pix_key text default null, p_commission_percent numeric default 20
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_code text;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  v_code := upper(trim(p_code));
  if v_code = '' or p_name is null or trim(p_name) = '' then raise exception 'nome e código são obrigatórios'; end if;
  if v_code !~ '^[A-Z0-9._-]{3,32}$' then raise exception 'código inválido (use 3-32 letras/números, sem espaços)'; end if;
  if p_commission_percent < 0 or p_commission_percent > 100 then raise exception 'percentual inválido'; end if;
  if exists (select 1 from public.affiliates where lower(code) = lower(v_code)) then
    raise exception 'já existe um afiliado com o código %', v_code;
  end if;

  insert into public.affiliates (code, name, email, pix_key, commission_percent)
  values (v_code, trim(p_name), nullif(trim(coalesce(p_email, '')), ''),
          nullif(trim(coalesce(p_pix_key, '')), ''), p_commission_percent)
  returning id into v_id;

  perform public._admin_log('create_affiliate', 'affiliate', v_id::text,
    jsonb_build_object('code', v_code, 'name', p_name, 'percent', p_commission_percent));
  return v_id;
end;
$$;

-- ─── Editar afiliado (dados + status) ────────────────────────────────────────
create or replace function public.admin_update_affiliate(
  p_id uuid, p_name text, p_email text, p_pix_key text,
  p_commission_percent numeric, p_status text
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('active', 'disabled') then raise exception 'status inválido: %', p_status; end if;
  if p_commission_percent < 0 or p_commission_percent > 100 then raise exception 'percentual inválido'; end if;
  update public.affiliates set
    name               = trim(p_name),
    email              = nullif(trim(coalesce(p_email, '')), ''),
    pix_key            = nullif(trim(coalesce(p_pix_key, '')), ''),
    commission_percent = p_commission_percent,
    status             = p_status,
    updated_at         = now()
  where id = p_id;
  if not found then raise exception 'afiliado não encontrado'; end if;
  perform public._admin_log('update_affiliate', 'affiliate', p_id::text,
    jsonb_build_object('name', p_name, 'percent', p_commission_percent, 'status', p_status));
end;
$$;

-- ─── Marcar comissões como pagas (repasse Pix feito por fora) ─────────────────
-- Liquida tudo que está 'pending'/'approved' do afiliado. Retorna o valor pago (centavos).
create or replace function public.admin_mark_commissions_paid(p_affiliate_id uuid)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare v_total bigint;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(sum(commission_amount_cents), 0) into v_total
    from public.commissions
   where affiliate_id = p_affiliate_id and status in ('pending', 'approved');

  update public.commissions
     set status = 'paid', paid_at = now()
   where affiliate_id = p_affiliate_id and status in ('pending', 'approved');

  perform public._admin_log('mark_commissions_paid', 'affiliate', p_affiliate_id::text,
    jsonb_build_object('amount_cents', v_total));
  return v_total;
end;
$$;

-- ─── Privilégios: somente authenticated (o guard is_admin() barra não-admins) ─
revoke all on function
  public.admin_list_affiliates(),
  public.admin_affiliate_detail(uuid),
  public.admin_create_affiliate(text, text, text, text, numeric),
  public.admin_update_affiliate(uuid, text, text, text, numeric, text),
  public.admin_mark_commissions_paid(uuid)
from public, anon;

grant execute on function
  public.admin_list_affiliates(),
  public.admin_affiliate_detail(uuid),
  public.admin_create_affiliate(text, text, text, text, numeric),
  public.admin_update_affiliate(uuid, text, text, text, numeric, text),
  public.admin_mark_commissions_paid(uuid)
to authenticated;
