-- 075 — Cron: recomputa o aprendizado do robô a cada 6h (acerto por sinal + diagnóstico IA).
select cron.unschedule(jobid) from cron.job where jobname = 'bot-learn-6h';
select cron.schedule(
  'bot-learn-6h',
  '20 */6 * * *',
  $job$
  select net.http_post(
    url := 'https://gshdynwrvabasjiapyap.supabase.co/functions/v1/bot-learn',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select value from public.app_secrets where key = 'newsletter_cron_key')
    ),
    body := '{}'::jsonb
  );
  $job$
);
