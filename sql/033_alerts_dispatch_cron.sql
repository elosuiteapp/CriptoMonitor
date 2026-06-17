-- ═══════════════════════════════════════════════════════════════════════════
-- 033_alerts_dispatch_cron.sql — Cron do alerts-dispatch (a cada 5 min)
-- Crypto Monitor
--
-- Agenda a Edge Function alerts-dispatch via pg_cron + pg_net. A função é
-- protegida pelo header x-dispatch-secret (== secret DISPATCH_SECRET da function).
-- IMPORTANTE: troque <DISPATCH_SECRET> pelo mesmo valor configurado nos secrets
-- do Supabase antes de aplicar (não versionar o segredo real).
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- (Re)agenda o job. cron.schedule com o mesmo nome substitui o anterior.
select cron.schedule(
  'alerts-dispatch-5min',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://gshdynwrvabasjiapyap.supabase.co/functions/v1/alerts-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-secret', '<DISPATCH_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $cron$
);
