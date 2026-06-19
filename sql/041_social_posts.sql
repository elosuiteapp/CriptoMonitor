-- 041 — Auto-post social (X + Telegram). Tabela de histórico, RPCs de config para o
-- admin (credenciais ficam em app_secrets, só service-role) e o cron diário.
-- A função edge social-post gera o "read do BTC" via IA e publica. Idempotente.

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  tweet text,
  telegram_md text,
  posted_x boolean not null default false,
  posted_telegram boolean not null default false,
  result jsonb,
  created_at timestamptz not null default now()
);
alter table public.social_posts enable row level security;
drop policy if exists "admin_read_social" on public.social_posts;
create policy "admin_read_social" on public.social_posts for select to authenticated using (public.is_admin());

-- Flag de auto-post (default OFF: só publica quando o admin ligar).
insert into public.app_secrets (key, value) values ('social_autopost', 'off')
on conflict (key) do nothing;

-- Admin salva credenciais (whitelist) pelo /admin/social; a tabela é service-role-only.
create or replace function public.set_social_secret(p_key text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_key not in (
    'telegram_bot_token', 'telegram_channel_id',
    'x_api_key', 'x_api_secret', 'x_access_token', 'x_access_secret',
    'social_autopost'
  ) then
    raise exception 'key not allowed';
  end if;
  insert into public.app_secrets(key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;
end;
$$;
revoke all on function public.set_social_secret(text, text) from public, anon;
grant execute on function public.set_social_secret(text, text) to authenticated;

-- Status da config (NUNCA devolve o valor dos segredos — só se está setado).
create or replace function public.social_config_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'telegram',
      exists(select 1 from app_secrets where key = 'telegram_bot_token' and value <> '')
      and exists(select 1 from app_secrets where key = 'telegram_channel_id' and value <> ''),
    'x',
      exists(select 1 from app_secrets where key = 'x_api_key' and value <> '')
      and exists(select 1 from app_secrets where key = 'x_access_token' and value <> ''),
    'autopost', coalesce((select value from app_secrets where key = 'social_autopost'), 'off')
  ) into r;
  return r;
end;
$$;
revoke all on function public.social_config_status() from public, anon;
grant execute on function public.social_config_status() to authenticated;

-- Cron diário: 13:00 UTC (~10h BRT). No-op enquanto social_autopost='off' ou sem credenciais.
select cron.unschedule(jobid) from cron.job where jobname = 'social-daily';
select cron.schedule(
  'social-daily',
  '0 13 * * *',
  $job$
  select net.http_post(
    url := 'https://gshdynwrvabasjiapyap.supabase.co/functions/v1/social-post',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select value from public.app_secrets where key = 'newsletter_cron_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
