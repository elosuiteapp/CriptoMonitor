-- 078 — Cobrança POR MÓDULO (Free / Cripto / B3 / Forex / Completo).
-- Colapsa Pro/Expert num tier único por módulo. Entitlement = plans.modules (quais
-- mercados o plano libera). Cripto segue gateado pelas flags (advanced/assets/preview);
-- B3/Forex pelo `modules`. Pro/Expert legados ganham modules={crypto} p/ não quebrar.
-- Anual = preço TOTAL/ano (o dono deu por-mês: R$59/mês => R$708/ano). Asaas cobra por valor.

alter table public.plans add column if not exists modules                text[] not null default '{}';
alter table public.plans add column if not exists price_annual_cents     int    not null default 0;  -- BRL total/ano no anual
alter table public.plans add column if not exists price_usd_annual_cents int    not null default 0;  -- USD total/ano no anual

-- Legado: mantém quem já assina. Pro/Expert = módulo cripto completo.
update public.plans set modules = array['crypto'] where slug in ('pro','expert');
update public.plans set modules = '{}'::text[]   where slug = 'free';

-- Catálogo novo (idempotente). Cripto/Completo = cripto FULL; B3/Forex = cripto em modo vitrine.
insert into public.plans
  (slug, name, price_cents, price_annual_cents, price_usd_cents, price_usd_annual_cents, sort_order,
   assets, snapshot_interval_min, advanced_metrics, chart_layers, preview_layers, smart_money,
   ai_daily_limit, ai_model, alert_channels, history_days, modules)
values
  ('mod_crypto', 'Cripto', 7900, 70800, 1900, 18000, 2,
   array['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','SUI','TON','POL','DOT','LTC','AAVE','UNI','LDO','ARB','ATOM','PEPE'],
   5, true, true, '{}'::text[], true, 30, 'claude-fable-5', array['email','whatsapp'], null, array['crypto']),
  ('mod_b3', 'B3', 7900, 70800, 1900, 18000, 1,
   array['BTC'], 5, false, true, array['gex','zeroGamma','maxPain','volumeProfile','cvd','bookPressure'], false,
   1, 'claude-haiku-4-5', array[]::text[], 1, array['b3']),
  ('mod_forex', 'Forex', 7900, 70800, 1900, 18000, 1,
   array['BTC'], 5, false, true, array['gex','zeroGamma','maxPain','volumeProfile','cvd','bookPressure'], false,
   1, 'claude-haiku-4-5', array[]::text[], 1, array['forex']),
  ('complete', 'OrbeView Completo', 15900, 154800, 3900, 37200, 3,
   array['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','SUI','TON','POL','DOT','LTC','AAVE','UNI','LDO','ARB','ATOM','PEPE'],
   5, true, true, '{}'::text[], true, 30, 'claude-fable-5', array['email','whatsapp'], null, array['crypto','b3','forex'])
on conflict (slug) do update set
  name = excluded.name, price_cents = excluded.price_cents, price_annual_cents = excluded.price_annual_cents,
  price_usd_cents = excluded.price_usd_cents, price_usd_annual_cents = excluded.price_usd_annual_cents,
  sort_order = excluded.sort_order, assets = excluded.assets, snapshot_interval_min = excluded.snapshot_interval_min,
  advanced_metrics = excluded.advanced_metrics, chart_layers = excluded.chart_layers, preview_layers = excluded.preview_layers,
  smart_money = excluded.smart_money, ai_daily_limit = excluded.ai_daily_limit, ai_model = excluded.ai_model,
  alert_channels = excluded.alert_channels, history_days = excluded.history_days, modules = excluded.modules;

-- Helper: módulos liberados p/ o usuário logado (do plano ativo). Usado pelo gating/RLS de B3/Forex.
create or replace function public.plan_modules()
returns text[]
language sql stable security definer set search_path = public
as $$ select coalesce((select modules from public.plans where slug = public.current_plan_slug()), '{}'::text[]); $$;
