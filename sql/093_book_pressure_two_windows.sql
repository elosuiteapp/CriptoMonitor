-- 093 — Medidor "pressão do book ±2%" com DUAS janelas (pedido do dono, 02/jul):
--   • '30m' — soma dos snapshots de orderbook_imbalance (±2% wide) dos últimos 30 min (como era);
--   • '1m'  — AO VIVO: último snapshot do orderbook_depth (coleta de 1 min) por exchange,
--             somando o notional dos buckets a ±2% do mid; se não houver depth (moeda fora de
--             BTC/ETH/SOL/BNB ou RLS), cai pro último snapshot do imbalance (~5 min).
-- Substitui as janelas 48h/12h (saíram do medidor). MESMA assinatura — o bot-run continua
-- lendo o '30m' pelo label. SECURITY INVOKER: RLS de imbalance/depth valem por usuário.
create or replace function public.get_book_pressure_windows(p_asset text)
returns table(label text, bid numeric, ask numeric)
language sql stable security invoker set search_path = public as $$
  with imb30 as (
    select coalesce(sum(bid_wide_usd), 0)::numeric as bid, coalesce(sum(ask_wide_usd), 0)::numeric as ask
    from public.orderbook_imbalance
    where asset = p_asset and ts > now() - interval '30 minutes'
  ),
  d as ( -- último snapshot de depth (1 min) por exchange
    select distinct on (exchange) mid, bids, asks
    from public.orderbook_depth
    where asset = p_asset and ts > now() - interval '5 minutes' and mid > 0
    order by exchange, ts desc
  ),
  live as (
    select
      (select coalesce(sum(v::numeric), 0) from jsonb_each_text(d.bids) as e(k, v)
        where k::numeric >= d.mid * 0.98 and k::numeric <= d.mid) as bid,
      (select coalesce(sum(v::numeric), 0) from jsonb_each_text(d.asks) as e(k, v)
        where k::numeric >= d.mid and k::numeric <= d.mid * 1.02) as ask
    from d
  ),
  live_sum as (select coalesce(sum(bid), 0)::numeric as bid, coalesce(sum(ask), 0)::numeric as ask from live),
  fb as ( -- fallback: último snapshot do imbalance por exchange (~5 min)
    select distinct on (exchange) bid_wide_usd, ask_wide_usd
    from public.orderbook_imbalance
    where asset = p_asset and ts > now() - interval '15 minutes'
    order by exchange, ts desc
  ),
  fb_sum as (select coalesce(sum(bid_wide_usd), 0)::numeric as bid, coalesce(sum(ask_wide_usd), 0)::numeric as ask from fb)
  select '30m'::text, bid, ask from imb30
  union all
  select '1m'::text,
    case when (select bid + ask from live_sum) > 0 then (select bid from live_sum) else (select bid from fb_sum) end,
    case when (select bid + ask from live_sum) > 0 then (select ask from live_sum) else (select ask from fb_sum) end;
$$;
revoke all on function public.get_book_pressure_windows(text) from public, anon;
grant execute on function public.get_book_pressure_windows(text) to authenticated;
