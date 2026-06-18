-- ═══════════════════════════════════════════════════════════════════════════
-- 035_alert_channels_inapp.sql — Alertas: canal in-app (corrige o gate da RLS)
--
-- A entrega de alertas migrou para in-app (Realtime) + Web Push (ver sql/032).
-- Mas `plans.alert_channels` ainda guardava {email}/{email,whatsapp}, e a policy
-- `alerts_insert`/`alerts_update` exige `channel = any(plan_alert_channels())`.
-- Como o front insere channel='inapp', o INSERT era REJEITADO para Pro/Expert
-- (criação de alertas quebrada — por isso `alerts` estava com 0 linhas).
--
-- Aqui alinhamos os valores ao canal real: 'inapp'. O gate por plano continua
-- valendo (free = {} → sem alertas; Pro/Expert = {inapp} → liberado). O Web Push
-- é uma camada POR-CIMA (se o usuário inscrever o navegador), não um canal
-- separado de plano. Remove também o legado email/whatsapp dos valores.
-- ═══════════════════════════════════════════════════════════════════════════

update public.plans set alert_channels = array['inapp']   where slug in ('pro','expert');
update public.plans set alert_channels = array[]::text[]  where slug = 'free';
