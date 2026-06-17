-- ═══════════════════════════════════════════════════════════════════════════
-- 025_admin_data_health.sql — Saúde do sistema: cobrir TODAS as fontes
-- Adiciona etf_flows, cot_positioning e market_liquidity ao monitor de frescor
-- (estavam de fora). Mesmo retorno (source, last_ts, age_min, row_count) — a
-- cadência ESPERADA por fonte fica no frontend (admin/System.tsx), pra fontes
-- diárias (Fear&Greed) e semanais (COT) não aparecerem como "obsoletas".
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.admin_data_health()
returns table(source text, last_ts timestamptz, age_min numeric, row_count bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with h as (
    select 'prices_cex'         as source, (select max(ts) from public.prices_cex)         as last_ts, (select count(*) from public.prices_cex)         as n
    union all select 'derivatives',        (select max(ts) from public.derivatives),        (select count(*) from public.derivatives)
    union all select 'options_oi',         (select max(ts) from public.options_oi),         (select count(*) from public.options_oi)
    union all select 'gamma_profile',      (select max(ts) from public.gamma_profile),      (select count(*) from public.gamma_profile)
    union all select 'onchain_perps',      (select max(ts) from public.onchain_perps),      (select count(*) from public.onchain_perps)
    union all select 'macro',              (select max(ts) from public.macro),              (select count(*) from public.macro)
    union all select 'macro_assets',       (select max(ts) from public.macro_assets),       (select count(*) from public.macro_assets)
    union all select 'macro_correlations', (select max(ts) from public.macro_correlations), (select count(*) from public.macro_correlations)
    union all select 'dex_liquidity',      (select max(ts) from public.dex_liquidity),      (select count(*) from public.dex_liquidity)
    union all select 'defi_health',        (select max(ts) from public.defi_health),        (select count(*) from public.defi_health)
    union all select 'sentiment',          (select max(ts) from public.sentiment),          (select count(*) from public.sentiment)
    union all select 'orderbook_walls',    (select max(ts) from public.orderbook_walls),    (select count(*) from public.orderbook_walls)
    union all select 'options_flow',       (select max(ts) from public.options_flow),       (select count(*) from public.options_flow)
    union all select 'volatility_index',   (select max(ts) from public.volatility_index),   (select count(*) from public.volatility_index)
    union all select 'liquidations',       (select max(ts) from public.liquidations),       (select count(*) from public.liquidations)
    union all select 'etf_flows',          (select max(ts) from public.etf_flows),          (select count(*) from public.etf_flows)
    union all select 'cot_positioning',    (select max(ts) from public.cot_positioning),    (select count(*) from public.cot_positioning)
    union all select 'market_liquidity',   (select max(ts) from public.market_liquidity),   (select count(*) from public.market_liquidity)
    union all select 'news_feed',          (select max(ts) from public.news_feed),          (select count(*) from public.news_feed)
    union all select 'market_snapshot',    (select max(ts) from public.market_snapshot),    (select count(*) from public.market_snapshot)
  )
  select h.source, h.last_ts,
         round(extract(epoch from (now() - h.last_ts)) / 60.0, 1) as age_min,
         h.n::bigint
  from h order by h.source;
end;
$$;
