-- ═══════════════════════════════════════════════════════════════════════════
-- 027_subscriptions_gateway.sql — origem da assinatura (multi-gateway)
-- Identifica por qual gateway a assinatura foi criada (mercadopago | asaas | paddle).
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.subscriptions add column if not exists gateway text;
comment on column public.subscriptions.gateway is 'mercadopago | asaas | paddle — origem da assinatura';
