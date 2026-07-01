-- 079 — Free SEM IA + newsletter semanal resiliente.
-- (1) Free não usa IA (ai_daily_limit=0); o botão vira cadeado no front. Módulos pagos
--     B3/Forex ganham cota de IA do próprio módulo (10/dia).
-- (2) O cron da newsletter roda 1×/semana (sex 12h UTC); uma falha transitória da IA
--     (ex.: Gemini 503) perdia a semana toda. Adiciono 2 retentativas (sex 16h e sáb 12h).
--     A função é idempotente (pula se já houve edição automática nos últimos 6 dias),
--     então as retentativas só GERAM se a semana ainda estiver sem edição.

update public.plans set ai_daily_limit = 0  where slug = 'free';
update public.plans set ai_daily_limit = 10 where slug in ('mod_b3', 'mod_forex');

select cron.schedule(
  'newsletter-weekly-retry1', '0 16 * * 5',
  $job$ select net.http_post(
    url := 'https://gshdynwrvabasjiapyap.supabase.co/functions/v1/newsletter-generate',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-key',(select value from public.app_secrets where key='newsletter_cron_key')),
    body := '{}'::jsonb
  ); $job$
);
select cron.schedule(
  'newsletter-weekly-retry2', '0 12 * * 6',
  $job$ select net.http_post(
    url := 'https://gshdynwrvabasjiapyap.supabase.co/functions/v1/newsletter-generate',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-key',(select value from public.app_secrets where key='newsletter_cron_key')),
    body := '{}'::jsonb
  ); $job$
);
