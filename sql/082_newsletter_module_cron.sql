-- 082 — Crons semanais das newsletters de B3 e Forex (funcao newsletter-module).
-- Escalonados na sexta (12:15 B3, 12:45 Forex) p/ nao bater no Gemini ao mesmo tempo
-- que a de cripto (12:00); retentativa no sabado. Idempotente por modulo (6 dias).
do $$
declare k text := (select value from public.app_secrets where key='newsletter_cron_key');
begin
  perform cron.schedule('newsletter-b3-weekly',    '15 12 * * 5', format($j$ select net.http_post(url:='https://gshdynwrvabasjiapyap.supabase.co/functions/v1/newsletter-module', headers:=jsonb_build_object('Content-Type','application/json','x-cron-key',%L), body:='{"module":"b3"}'::jsonb); $j$, k));
  perform cron.schedule('newsletter-b3-retry',     '15 12 * * 6', format($j$ select net.http_post(url:='https://gshdynwrvabasjiapyap.supabase.co/functions/v1/newsletter-module', headers:=jsonb_build_object('Content-Type','application/json','x-cron-key',%L), body:='{"module":"b3"}'::jsonb); $j$, k));
  perform cron.schedule('newsletter-forex-weekly', '45 12 * * 5', format($j$ select net.http_post(url:='https://gshdynwrvabasjiapyap.supabase.co/functions/v1/newsletter-module', headers:=jsonb_build_object('Content-Type','application/json','x-cron-key',%L), body:='{"module":"forex"}'::jsonb); $j$, k));
  perform cron.schedule('newsletter-forex-retry',  '45 12 * * 6', format($j$ select net.http_post(url:='https://gshdynwrvabasjiapyap.supabase.co/functions/v1/newsletter-module', headers:=jsonb_build_object('Content-Type','application/json','x-cron-key',%L), body:='{"module":"forex"}'::jsonb); $j$, k));
end $$;
