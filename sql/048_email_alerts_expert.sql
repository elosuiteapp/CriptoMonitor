-- ═══════════════════════════════════════════════════════════════════════════
-- 048_email_alerts_expert.sql — Alerta por e-mail (opt-in), exclusivo do Expert
--
-- A entrega de alertas é in-app (sino) + Web Push (ver sql/032, sql/035). Aqui
-- adicionamos o e-mail como camada OPCIONAL e POR-USUÁRIO, disponível só no Expert:
--   • profiles.email_alerts → opt-in do usuário (default false; ele liga na UI).
--   • plans.alert_channels do Expert ganha 'email' → marca que o plano PODE enviar.
--
-- O e-mail NÃO é um canal por-alerta (os alerts continuam channel='inapp'); o
-- despachante (alerts-dispatch) decide enviar e-mail quando, ao disparar:
--   plano tem 'email' (Expert)  E  profiles.email_alerts = true  E  há e-mail.
-- Sem o secret RESEND_API_KEY configurado, o despachante simplesmente não envia.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Opt-in por usuário.
alter table public.profiles
  add column if not exists email_alerts boolean not null default false;

-- 2) Canais por plano: e-mail só no Expert (in-app segue em Pro/Expert).
update public.plans set alert_channels = array['inapp','email'] where slug = 'expert';
update public.plans set alert_channels = array['inapp']         where slug = 'pro';
update public.plans set alert_channels = array[]::text[]        where slug = 'free';
