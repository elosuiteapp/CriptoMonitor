-- ═══════════════════════════════════════════════════════════════════════════
-- 055_book_depth_grid_rpc.sql — RPC do heatmap de book (escada FUNDIDA + downsample)
-- O front (useOrderbookDepth) buscava só 2h CRUS (e esbarraria no teto de linhas),
-- então em TF alto (4H/1D) o heatmap virava uma fatia fina na borda direita.
-- Aqui entregamos até 48h (toda a retenção) sem estourar o payload: por bucket de
-- tempo pegamos o ÚLTIMO snapshot de cada exchange, SOMAMOS os notional por preço
-- entre as exchanges (Coinbase preenche o longe; Binance/OKX o perto) e reagrupamos
-- em JSONB → 1 coluna por bucket (≠ 3 linhas/min crus). SECURITY INVOKER mantém a
-- RLS Pro+ (plan_is_advanced + ts_within_history) valendo dentro da função.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.get_book_depth_grid(
  p_asset text,
  p_since timestamptz,
  p_bucket_seconds int default 120
)
returns table (ts timestamptz, mid double precision, bids jsonb, asks jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      (floor(extract(epoch from d.ts) / greatest(p_bucket_seconds, 1))::bigint
        * greatest(p_bucket_seconds, 1)) as b_epoch,
      d.exchange, d.ts, d.mid, d.bids, d.asks
    from public.orderbook_depth d
    where d.asset = p_asset
      and d.ts >= p_since
  ),
  latest as (  -- último snapshot de cada exchange dentro do bucket de tempo
    select distinct on (b_epoch, exchange)
      b_epoch, exchange, mid, bids, asks
    from base
    order by b_epoch, exchange, ts desc
  ),
  lvl as (     -- explode os níveis de preço dos dois lados
    select b_epoch, 'bid' as side,
           (e.key)::double precision as price, (e.value)::double precision as notional
      from latest, lateral jsonb_each_text(bids) as e
    union all
    select b_epoch, 'ask' as side,
           (e.key)::double precision as price, (e.value)::double precision as notional
      from latest, lateral jsonb_each_text(asks) as e
  ),
  fused as (   -- soma os notional por preço ENTRE as exchanges
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
