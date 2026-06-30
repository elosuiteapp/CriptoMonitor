-- 062 — Robô OKX demo AUTOMÁTICO (v2). Config liga/desliga + parâmetros da estratégia,
-- histórico de ordens enriquecido (preço de execução, origem) e log de decisões.
-- A execução roda na Edge Function bot-run (pg_cron a cada 5 min). Tudo admin-only.

-- Config do robô (linha única id=1). Estratégia inicial = cruzamento de EMAs.
create table if not exists public.bot_config (
  id            int primary key default 1,
  enabled       boolean not null default false,
  inst_id       text not null default 'BTC-USDT',
  base_ccy      text not null default 'BTC',
  quote_ccy     text not null default 'USDT',
  bar           text not null default '1H',          -- timeframe das velas (OKX)
  ema_fast      int not null default 9,
  ema_slow      int not null default 21,
  order_quote_sz numeric not null default 50,        -- tamanho da compra em moeda de cotação (ex.: USDT)
  updated_at    timestamptz not null default now(),
  constraint bot_config_singleton check (id = 1)
);
insert into public.bot_config (id) values (1) on conflict (id) do nothing;
alter table public.bot_config enable row level security;
drop policy if exists "admin_read_bot_config" on public.bot_config;
create policy "admin_read_bot_config" on public.bot_config for select to authenticated using (public.is_admin());

-- Histórico de ordens: origem (manual/auto) + preço e tamanho executados.
alter table public.bot_orders add column if not exists source  text not null default 'manual';
alter table public.bot_orders add column if not exists avg_px  numeric;
alter table public.bot_orders add column if not exists fill_sz numeric;
alter table public.bot_orders add column if not exists note    text;

-- Log das decisões do robô (inclui "segurou" / "sem sinal") — pra acompanhar o que ele anda fazendo.
create table if not exists public.bot_logs (
  id         bigint generated always as identity primary key,
  level      text not null default 'info',     -- info | trade | warn | error
  message    text not null,
  detail     jsonb,
  created_at timestamptz not null default now()
);
alter table public.bot_logs enable row level security;
drop policy if exists "admin_read_bot_logs" on public.bot_logs;
create policy "admin_read_bot_logs" on public.bot_logs for select to authenticated using (public.is_admin());

-- Admin lê a config.
create or replace function public.bot_get_config()
returns public.bot_config language plpgsql security definer set search_path = public as $$
declare r public.bot_config;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select * into r from public.bot_config where id = 1;
  return r;
end;
$$;
revoke all on function public.bot_get_config() from public, anon;
grant execute on function public.bot_get_config() to authenticated;

-- Admin atualiza a config (campos whitelistados).
create or replace function public.bot_set_config(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.bot_config set
    enabled        = coalesce((p->>'enabled')::boolean, enabled),
    inst_id        = coalesce(p->>'inst_id', inst_id),
    base_ccy       = coalesce(p->>'base_ccy', base_ccy),
    quote_ccy      = coalesce(p->>'quote_ccy', quote_ccy),
    bar            = coalesce(p->>'bar', bar),
    ema_fast       = coalesce((p->>'ema_fast')::int, ema_fast),
    ema_slow       = coalesce((p->>'ema_slow')::int, ema_slow),
    order_quote_sz = coalesce((p->>'order_quote_sz')::numeric, order_quote_sz),
    updated_at     = now()
  where id = 1;
end;
$$;
revoke all on function public.bot_set_config(jsonb) from public, anon;
grant execute on function public.bot_set_config(jsonb) to authenticated;

-- Cron: roda o robô a cada 5 min (no-op enquanto enabled=false ou sem credenciais).
select cron.unschedule(jobid) from cron.job where jobname = 'bot-run-5min';
select cron.schedule(
  'bot-run-5min',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://gshdynwrvabasjiapyap.supabase.co/functions/v1/bot-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select value from public.app_secrets where key = 'newsletter_cron_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
