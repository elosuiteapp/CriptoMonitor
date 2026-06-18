-- ═══════════════════════════════════════════════════════════════════════════
-- 034_plan_assets_pro_majors.sql — Pro cobre só os 3 majors (BTC/ETH/SOL)
--
-- Decisão de produto: o Pro passa a cobrir apenas os 3 ativos principais
-- (BTC/ETH/SOL) — exatamente onde existe a camada institucional completa
-- (gamma/opções via Deribit BTC/ETH + Bybit SOL). O Expert continua cobrindo
-- os 20 ativos. Como os limites são parametrizados em `plans.assets` (ver 002),
-- isto é apenas um UPDATE — sem deploy, sem mudança de código.
-- ═══════════════════════════════════════════════════════════════════════════

update public.plans
   set assets = array['BTC','ETH','SOL']
 where slug = 'pro';

-- Reafirma o teto do Expert (idempotente; documenta a intenção).
update public.plans
   set assets = array['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','SUI',
                      'TON','POL','DOT','LTC','AAVE','UNI','LDO','ARB','ATOM','PEPE']
 where slug = 'expert';
