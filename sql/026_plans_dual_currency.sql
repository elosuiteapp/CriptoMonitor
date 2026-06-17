-- ═══════════════════════════════════════════════════════════════════════════
-- 026_plans_dual_currency.sql — cobrança em BRL e USD por idioma
-- price_cents (BRL, já existia) + price_usd_cents (USD) + paddle_price_id (id do
-- preço no Paddle, para o checkout internacional). PT→Asaas/BRL, EN→Paddle/USD.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.plans add column if not exists price_usd_cents int not null default 0;
alter table public.plans add column if not exists paddle_price_id text;

-- Preços iniciais (editáveis no /admin). USD definido por valor, não por câmbio.
update public.plans set price_usd_cents = case slug
  when 'pro'    then 1900   -- US$ 19/mês
  when 'expert' then 4900   -- US$ 49/mês
  else 0 end;
