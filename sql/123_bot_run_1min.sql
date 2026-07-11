-- 123: bot-run a cada 1 min (era 5). A estrutura SMC segue na VELA FECHADA de 15m (o motor
-- descarta a vela em formação, bot-run:981) — rodar a cada 1 min só faz o robô (a) pegar o
-- fechamento da vela de 15m em ~1 min em vez de até 5, e (b) reler o book/pressão fresco
-- (coletor do book a 1 min, ciclo rápido do aggregator.py). A histerese da força ponderada
-- (conf2_enter/conf2_hold) segura o churn. No-op enquanto enabled=false / sem credenciais.
select cron.unschedule(jobid) from cron.job where jobname = 'bot-run-5min';
select cron.unschedule(jobid) from cron.job where jobname = 'bot-run-1min';
select cron.schedule(
  'bot-run-1min',
  '* * * * *',
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
