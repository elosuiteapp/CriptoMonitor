-- ═══════════════════════════════════════════════════════════════════════════
-- 020_plan_features.sql — Flag smart_money + tiers (catálogo de 14 moedas,
-- Expert: Smart Money exclusivo + 30 análises/dia)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Flag de acesso ao módulo Smart Money (editável no painel admin) ─────────
alter table public.plans add column if not exists smart_money boolean not null default false;
update public.plans set smart_money = (slug = 'expert');

-- ─── Tiers: moedas (todas no pago), IA por plano, Smart Money no Expert ──────
update public.plans
  set assets = array['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','SUI','TON','POL','DOT','LTC']
  where slug in ('pro', 'expert');
update public.plans set ai_daily_limit = 30 where slug = 'expert';   -- teto por plano (era ilimitado)

-- ─── admin_update_plan: nova assinatura com p_smart_money ─────────────────────
drop function if exists public.admin_update_plan(text, text, int, text[], int, boolean, boolean, int, text, text[], int);

create or replace function public.admin_update_plan(
  p_slug text,
  p_name text,
  p_price_cents int,
  p_assets text[],
  p_snapshot_interval_min int,
  p_advanced boolean,
  p_chart_layers boolean,
  p_smart_money boolean,
  p_ai_daily_limit int,
  p_ai_model text,
  p_alert_channels text[],
  p_history_days int
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.plans set
    name                  = p_name,
    price_cents           = p_price_cents,
    assets                = p_assets,
    snapshot_interval_min = p_snapshot_interval_min,
    advanced_metrics      = p_advanced,
    chart_layers          = p_chart_layers,
    smart_money           = p_smart_money,
    ai_daily_limit        = p_ai_daily_limit,
    ai_model              = p_ai_model,
    alert_channels        = p_alert_channels,
    history_days          = p_history_days
  where slug = p_slug;
  if not found then raise exception 'plano % nao existe', p_slug; end if;
  perform public._admin_log('update_plan', 'plan', p_slug,
    jsonb_build_object('name', p_name, 'price_cents', p_price_cents, 'assets', p_assets, 'smart_money', p_smart_money, 'ai_model', p_ai_model));
end;
$$;

revoke all on function public.admin_update_plan(text, text, int, text[], int, boolean, boolean, boolean, int, text, text[], int) from public, anon;
grant execute on function public.admin_update_plan(text, text, int, text[], int, boolean, boolean, boolean, int, text, text[], int) to authenticated;
