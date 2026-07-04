-- 105_cockpit_report_retry_cron.sql
-- RELATÓRIOS DIÁRIOS (cockpit-report) — registro do agendamento + repescagem.
-- Contexto (auditoria 03/jul): o cron principal `cockpit-report-daily` (0 11 * * * UTC) já
-- existia SÓ no banco (criado fora do repo — este arquivo documenta). Em 03/jul o disparo
-- das 11h falhou com "gemini 429" (cota diária do free tier esgotada) e o dia ficou sem
-- relatório — sem retry, sem aviso.
-- Blindagem aplicada (função cockpit-report redeployada):
--   • CRON IDEMPOTENTE por dia UTC: pula ativo que já tem relatório de hoje;
--   • 429 → espera 30s e re-tenta o flash (cobre limite POR MINUTO do free tier);
--   • modo manual com cooldown de 30 min por ativo (clique repetido não queima cota).
-- Este arquivo cria a REPESCAGEM: 15:00 UTC (12:00 BRT) — só gera o que faltou às 11h.

do $$ begin perform cron.unschedule('cockpit-report-retry'); exception when others then null; end $$;
select cron.schedule(
  'cockpit-report-retry',
  '0 15 * * *',
  $cron$
  select net.http_post(
    url := 'https://gshdynwrvabasjiapyap.supabase.co/functions/v1/cockpit-report',
    headers := jsonb_build_object('Content-Type','application/json','x-dispatch-secret','<DISPATCH_SECRET>'),
    body := '{}'::jsonb
  );
  $cron$
);
-- NOTA: no banco o <DISPATCH_SECRET> foi substituído pelo valor real (igual ao job das 11h).
