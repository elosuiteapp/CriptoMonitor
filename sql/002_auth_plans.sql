-- ═══════════════════════════════════════════════════════════════════════════
-- 002_auth_plans.sql — Planos, perfis, assinaturas, cota de uso
-- Crypto Monitor · PRD §5.2 e §7
--
-- Princípio: limites de cada plano ficam PARAMETRIZADOS em colunas da tabela
-- `plans`, nunca hardcoded no código. Trocar um limite = um UPDATE, sem deploy.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── plans — catálogo de planos com limites parametrizados ───────────────────
create table if not exists public.plans (
  id                    uuid        primary key default gen_random_uuid(),
  slug                  text        unique not null,        -- 'free' | 'pro' | 'expert'
  name                  text        not null,
  price_cents           int         not null default 0,     -- preço mensal em centavos (BRL)
  sort_order            int         not null default 0,      -- free=0, pro=1, expert=2
  assets                text[]      not null,                -- ativos liberados
  snapshot_interval_min int         not null,                -- 30 (free) | 5 (pro/expert)
  advanced_metrics      boolean     not null default false,  -- liquidações, GEX, funding, DEX
  chart_layers          boolean     not null default false,  -- camadas sobre os candles
  ai_daily_limit        int,                                 -- null = ilimitado
  ai_model              text        not null,                -- modelo Claude do plano
  alert_channels        text[]      not null default '{}',   -- {} | {email} | {email,whatsapp}
  history_days          int,                                 -- null = completo
  created_at            timestamptz not null default now()
);

-- Seed dos 3 planos do MVP (PRD §7.1). Idempotente.
insert into public.plans
  (slug, name, price_cents, sort_order, assets, snapshot_interval_min,
   advanced_metrics, chart_layers, ai_daily_limit, ai_model, alert_channels, history_days)
values
  ('free',   'Free',       0, 0, array['BTC'],              30, false, false,    1, 'claude-haiku-4-5',  array[]::text[],            1),
  ('pro',    'Pro',     5900, 1, array['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','SUI','TON','POL','DOT','LTC','AAVE','UNI','LDO','ARB','ATOM'],   5, true,  true,    10, 'claude-sonnet-4-6', array['email'],            30),
  ('expert', 'Expert', 14900, 2, array['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','SUI','TON','POL','DOT','LTC','AAVE','UNI','LDO','ARB','ATOM'],   5, true,  true,    30, 'claude-fable-5',    array['email','whatsapp'], null)
on conflict (slug) do update set
  name                  = excluded.name,
  price_cents           = excluded.price_cents,
  sort_order            = excluded.sort_order,
  assets                = excluded.assets,
  snapshot_interval_min = excluded.snapshot_interval_min,
  advanced_metrics      = excluded.advanced_metrics,
  chart_layers          = excluded.chart_layers,
  ai_daily_limit        = excluded.ai_daily_limit,
  ai_model              = excluded.ai_model,
  alert_channels        = excluded.alert_channels,
  history_days          = excluded.history_days;

-- ─── profiles — extensão de auth.users ───────────────────────────────────────
create table if not exists public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,                                   -- E.164 para WhatsApp (Expert)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── subscriptions — assinatura ativa por usuário ────────────────────────────
create table if not exists public.subscriptions (
  id                       uuid        primary key default gen_random_uuid(),
  user_id                  uuid        not null references auth.users (id) on delete cascade,
  plan_id                  uuid        not null references public.plans (id),
  status                   text        not null default 'active',   -- active | canceled | past_due
  gateway_customer_id      text,
  gateway_subscription_id  text,
  current_period_end       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
-- No máximo uma assinatura ativa por usuário.
create unique index if not exists uq_subscriptions_active_user
  on public.subscriptions (user_id) where status = 'active';
create index if not exists idx_subscriptions_user on public.subscriptions (user_id);

-- ─── usage_log — cota diária (ex: análises de IA) ────────────────────────────
create table if not exists public.usage_log (
  id       uuid    primary key default gen_random_uuid(),
  user_id  uuid    not null references auth.users (id) on delete cascade,
  action   text    not null default 'ai_analysis',
  day      date    not null default ((now() at time zone 'utc')::date),
  count    int     not null default 0,
  unique (user_id, action, day)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Trigger: cria profile + assinatura Free automaticamente a cada novo usuário.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;

  insert into public.subscriptions (user_id, plan_id, status)
  select new.id, p.id, 'active'
  from public.plans p
  where p.slug = 'free'
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══════════════════════════════════════════════════════════════════════════
-- Helpers de plano — usados pelas policies RLS (003).
-- SECURITY DEFINER para ler plans/subscriptions independente de RLS dessas tabelas.
-- STABLE: o Postgres pode reaproveitar o resultado dentro de uma mesma query.
-- ═══════════════════════════════════════════════════════════════════════════

-- Slug do plano efetivo do usuário logado (default 'free').
create or replace function public.current_plan_slug()
returns text
language sql stable security definer set search_path = public
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
language sql stable security definer set search_path = public
as $$ select assets from public.plans where slug = public.current_plan_slug(); $$;

create or replace function public.plan_is_advanced()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select advanced_metrics from public.plans where slug = public.current_plan_slug()), false); $$;

create or replace function public.plan_snapshot_min()
returns int
language sql stable security definer set search_path = public
as $$ select coalesce((select snapshot_interval_min from public.plans where slug = public.current_plan_slug()), 30); $$;

create or replace function public.plan_history_days()
returns int
language sql stable security definer set search_path = public
as $$ select history_days from public.plans where slug = public.current_plan_slug(); $$;

create or replace function public.plan_alert_channels()
returns text[]
language sql stable security definer set search_path = public
as $$ select coalesce((select alert_channels from public.plans where slug = public.current_plan_slug()), '{}'::text[]); $$;
