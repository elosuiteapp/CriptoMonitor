-- 109_admin_timezone_brt.sql — pendência da auditoria do /admin (06/jul): as agregações diárias
-- do painel rodavam em UTC → "hoje" (users_today/ai_today/custo hoje) e os gráficos por dia
-- viravam às 21h de Brasília. Correção CIRÚRGICA: timezone no NÍVEL DA FUNÇÃO (GUC) — o
-- date_trunc('day', now()) e todos os casts ::date do corpo passam a avaliar em America/Sao_Paulo
-- sem reescrever nenhuma função (zero risco de regressão de lógica).

alter function public.admin_overview() set timezone to 'America/Sao_Paulo';
alter function public.admin_signups_timeseries(integer) set timezone to 'America/Sao_Paulo';
alter function public.admin_usage_timeseries(integer) set timezone to 'America/Sao_Paulo';
alter function public.admin_ai_costs() set timezone to 'America/Sao_Paulo';
