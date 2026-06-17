-- ═══════════════════════════════════════════════════════════════════════════
-- 031_subscription_cancel.sql — Cancelamento self-service ("cancelar ao fim do ciclo")
-- Crypto Monitor
--
-- Quando o usuário cancela, NÃO cortamos o acesso na hora: ele paga até o fim do
-- período vigente. Marcamos `cancel_at_period_end = true` e (no Asaas) removemos a
-- assinatura remota para não gerar nova cobrança. O acesso cai sozinho quando
-- `current_period_end` expira, pois current_plan_slug() já checa essa data.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;
