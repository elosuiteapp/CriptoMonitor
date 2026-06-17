-- ═══════════════════════════════════════════════════════════════════════════
-- 032_notifications_webpush.sql — Alertas in-app + Web Push (sino, toast, push)
-- Crypto Monitor
--
-- Substitui a entrega por e-mail/WhatsApp por: notificação no sistema (tabela
-- `notifications` + Realtime → sino, central e toast) e Web Push no navegador
-- (tabela `push_subscriptions`, enviado pelo alerts-dispatch via VAPID).
-- Anti-spam: `alerts.last_triggered_at` (cooldown, ver alerts-dispatch).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) notifications: eventos de alerta entregues ao usuário (in-app + push)
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  alert_id    uuid references public.alerts(id) on delete set null,
  title       text not null,
  body        text not null,
  asset       text,
  metric      text,
  value       text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;  -- marcar como lida
create policy notifications_update on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2) push_subscriptions: inscrições Web Push por navegador/dispositivo
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_push_subs_user on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subs_select on public.push_subscriptions;
create policy push_subs_select on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists push_subs_insert on public.push_subscriptions;
create policy push_subs_insert on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists push_subs_delete on public.push_subscriptions;
create policy push_subs_delete on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- 3) alerts: cooldown anti-spam + canal in-app (remove a trava email/whatsapp)
alter table public.alerts add column if not exists last_triggered_at timestamptz;
alter table public.alerts drop constraint if exists alerts_channel_check;
alter table public.alerts alter column channel set default 'inapp';
alter table public.alerts alter column channel drop not null;
alter table public.alerts add constraint alerts_channel_check
  check (channel in ('inapp','email','whatsapp'));

-- 4) Realtime para notifications (idempotente)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
