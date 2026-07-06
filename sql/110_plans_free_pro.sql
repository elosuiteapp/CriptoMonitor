-- 110_plans_free_pro.sql — REESTRUTURAÇÃO DE PLANOS (decisão do dono 06/jul): só FREE + PRO.
--   • PRO (slug 'pro' reaproveitado — o ranking de conteúdo já o trata como pagante):
--     R$99/US$29 mensal · anual 10× (R$990/US$290) · modules {crypto,b3,forex} · Smart Money ·
--     30 IA/dia · 20 ativos · histórico completo · demais capacidades herdadas do 'complete'.
--   • FREE: vitrine AO VIVO (sem delay — snapshot 5min igual pago; o campo nem é usado no runtime).
--   • expert / mod_crypto / mod_b3 / mod_forex / complete: ficam na tabela (histórico de
--     assinaturas aponta pra eles) mas NÃO VENDÁVEIS — nova coluna `sellable` governa checkout,
--     página de preços e badge no admin. Gates continuam por CAPACIDADE (modules/smart_money).
--   • Única assinatura ativa fora de free/pro era a cortesia do admin no Expert → migrada pro PRO.
--   • Newsletter: min_tier 'expert' vira 'pro' (o rank expert ficaria inatingível).
--   • admin_update_plan v5: ganha p_sellable (o admin liga/desliga venda pelo painel).
-- PENDÊNCIA EXTERNA: criar o preço de US$29 no Paddle e salvar o paddle_price_id no plano PRO
-- (o checkout EN depende disso; o Asaas/PT lê o preço direto da tabela).

alter table public.plans add column if not exists sellable boolean not null default false;

-- PRO = tudo liberado (capacidades espelhadas do antigo 'complete', preço novo)
update public.plans set
  name = 'Pro',
  price_cents = 9900, price_usd_cents = 2900,
  price_annual_cents = 99000, price_usd_annual_cents = 29000,
  modules = '{crypto,b3,forex}',
  smart_money = true, advanced_metrics = true, chart_layers = true,
  ai_daily_limit = 30,
  ai_model = (select ai_model from public.plans where slug = 'complete'),
  assets = (select assets from public.plans where slug = 'complete'),
  alert_channels = '{inapp,email}',
  history_days = null,
  snapshot_interval_min = 5,
  sellable = true,
  sort_order = 1
where slug = 'pro';

update public.plans set sellable = true, snapshot_interval_min = 5, sort_order = 0 where slug = 'free';
update public.plans set sellable = false where slug in ('expert', 'mod_crypto', 'mod_b3', 'mod_forex', 'complete');

-- Migra assinaturas ATIVAS do expert (só a cortesia do admin) pro PRO.
update public.subscriptions set plan_id = (select id from public.plans where slug = 'pro')
where plan_id = (select id from public.plans where slug = 'expert') and status = 'active';

-- Newsletter: nível 'expert' deixa de existir → vira 'pro'.
update public.newsletter_editions set min_tier = 'pro' where min_tier = 'expert';

-- admin_update_plan v5 (+ p_sellable)
drop function if exists public.admin_update_plan(text, text, integer, integer, integer, integer, text, text[], text[], integer, boolean, boolean, boolean, integer, text, text[], integer, text[]);
create or replace function public.admin_update_plan(
  p_slug text, p_name text, p_price_cents integer, p_price_usd_cents integer,
  p_price_annual_cents integer, p_price_usd_annual_cents integer,
  p_paddle_price_id text, p_modules text[], p_assets text[], p_snapshot_interval_min integer,
  p_advanced boolean, p_chart_layers boolean, p_smart_money boolean,
  p_ai_daily_limit integer, p_ai_model text, p_alert_channels text[], p_history_days integer,
  p_preview_layers text[], p_sellable boolean
) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.plans set
    name                   = p_name,
    price_cents            = p_price_cents,
    price_usd_cents        = p_price_usd_cents,
    price_annual_cents     = coalesce(p_price_annual_cents, 0),
    price_usd_annual_cents = coalesce(p_price_usd_annual_cents, 0),
    paddle_price_id        = nullif(btrim(coalesce(p_paddle_price_id, '')), ''),
    modules                = coalesce(p_modules, '{}'),
    assets                 = p_assets,
    snapshot_interval_min  = p_snapshot_interval_min,
    advanced_metrics       = p_advanced,
    chart_layers           = p_chart_layers,
    smart_money            = p_smart_money,
    ai_daily_limit         = p_ai_daily_limit,
    ai_model               = p_ai_model,
    alert_channels         = p_alert_channels,
    history_days           = p_history_days,
    preview_layers         = coalesce(p_preview_layers, '{}'),
    sellable               = coalesce(p_sellable, false)
  where slug = p_slug;
  if not found then raise exception 'plano % nao existe', p_slug; end if;
  perform public._admin_log('update_plan', 'plan', p_slug,
    jsonb_build_object('name', p_name, 'price_cents', p_price_cents, 'price_usd_cents', p_price_usd_cents,
                       'modules', p_modules, 'sellable', p_sellable, 'smart_money', p_smart_money, 'ai_model', p_ai_model));
end;
$$;
revoke all on function public.admin_update_plan(text, text, integer, integer, integer, integer, text, text[], text[], integer, boolean, boolean, boolean, integer, text, text[], integer, text[], boolean) from public, anon;
grant execute on function public.admin_update_plan(text, text, integer, integer, integer, integer, text, text[], text[], integer, boolean, boolean, boolean, integer, text, text[], integer, text[], boolean) to authenticated;
