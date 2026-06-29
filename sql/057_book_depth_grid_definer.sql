-- ═══════════════════════════════════════════════════════════════════════════
-- 057_book_depth_grid_definer.sql — fix do RPC do heatmap de book (timeout 500)
-- O RPC sql/055 era SECURITY INVOKER → a RLS de orderbook_depth aplicava
-- `plan_is_advanced()` POR LINHA (~8.600 linhas/48h) → ~8s → estourava o
-- statement_timeout (8s) do PostgREST → 500 → heatmap vazio no front.
-- (Como superuser/MCP a RLS é ignorada, por isso só falhava no app.)
-- Fix: SECURITY DEFINER (ignora RLS na varredura) + checa o plano UMA vez dentro
-- da função (mesmo gate Pro+). Sem RLS por linha, roda em ~700ms.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.get_book_depth_grid(
  p_asset text,
  p_since timestamptz,
  p_bucket_seconds int default 120
)
returns table (ts timestamptz, mid double precision, bids jsonb, asks jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with gate as (select public.plan_is_advanced() as ok),  -- gate Pro+ avaliado UMA vez
  base as (
    select
      (floor(extract(epoch from d.ts) / greatest(p_bucket_seconds, 1))::bigint
        * greatest(p_bucket_seconds, 1)) as b_epoch,
      d.exchange, d.ts, d.mid, d.bids, d.asks
    from public.orderbook_depth d
    where (select ok from gate)   -- só Pro+ (gating); senão retorna vazio
      and d.asset = p_asset
      and d.ts >= p_since
  ),
  latest as (
    select distinct on (b_epoch, exchange)
      b_epoch, exchange, mid, bids, asks
    from base
    order by b_epoch, exchange, ts desc
  ),
  lvl as (
    select b_epoch, 'bid' as side,
           (e.key)::double precision as price, (e.value)::double precision as notional
      from latest, lateral jsonb_each_text(bids) as e
    union all
    select b_epoch, 'ask' as side,
           (e.key)::double precision as price, (e.value)::double precision as notional
      from latest, lateral jsonb_each_text(asks) as e
  ),
  fused as (
    select b_epoch, side, price, sum(notional) as notional
    from lvl
    where notional > 0
    group by b_epoch, side, price
  ),
  mids as (
    select b_epoch, avg(mid) as mid from latest group by b_epoch
  )
  select
    to_timestamp(f.b_epoch) as ts,
    m.mid,
    coalesce(jsonb_object_agg(f.price::text, f.notional)
             filter (where f.side = 'bid'), '{}'::jsonb) as bids,
    coalesce(jsonb_object_agg(f.price::text, f.notional)
             filter (where f.side = 'ask'), '{}'::jsonb) as asks
  from fused f
  join mids m using (b_epoch)
  group by f.b_epoch, m.mid
  order by f.b_epoch;
$$;

grant execute on function public.get_book_depth_grid(text, timestamptz, int) to authenticated;
