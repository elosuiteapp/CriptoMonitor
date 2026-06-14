-- ═══════════════════════════════════════════════════════════════════════════
-- 007_oi_delta.sql — Delta de Open Interest (PRD3 §8.8.4) — Fase 6
-- View sobre `derivatives` (zero fonte nova): variação do OI em 4h e 24h + a
-- variação de preço no mesmo período, para a leitura de fluxo (OI×preço).
-- security_invoker=true → respeita o RLS de derivatives/prices_cex (Pro+).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace view public.v_oi_delta
with (security_invoker = true) as
with latest as (
  select distinct on (asset) asset, ts, open_interest
  from public.derivatives
  where open_interest is not null
  order by asset, ts desc
)
select
  l.asset,
  l.ts,
  l.open_interest                                                          as oi_now,
  case when oi4.open_interest  > 0 then (l.open_interest - oi4.open_interest)  / oi4.open_interest  end as oi_delta_4h,
  case when oi24.open_interest > 0 then (l.open_interest - oi24.open_interest) / oi24.open_interest end as oi_delta_24h,
  case when p4.price           > 0 then (p.price - p4.price)                   / p4.price           end as price_delta_4h
from latest l
left join lateral (
  select open_interest from public.derivatives d
  where d.asset = l.asset and d.open_interest is not null and d.ts <= now() - interval '4 hours'
  order by d.ts desc limit 1
) oi4 on true
left join lateral (
  select open_interest from public.derivatives d
  where d.asset = l.asset and d.open_interest is not null and d.ts <= now() - interval '24 hours'
  order by d.ts desc limit 1
) oi24 on true
left join lateral (
  select price from public.prices_cex pc
  where pc.asset = l.asset and pc.exchange = 'binance' and pc.price is not null
  order by pc.ts desc limit 1
) p on true
left join lateral (
  select price from public.prices_cex pc
  where pc.asset = l.asset and pc.exchange = 'binance' and pc.price is not null and pc.ts <= now() - interval '4 hours'
  order by pc.ts desc limit 1
) p4 on true;

grant select on public.v_oi_delta to authenticated;
