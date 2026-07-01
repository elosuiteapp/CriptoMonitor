-- 071 — Pressão do book (±2%) por janela (48h/12h/30m) a partir do orderbook_imbalance,
-- que existe para TODAS as moedas (o depth/heatmap só cobre BTC/ETH/SOL/BNB). Soma no
-- servidor p/ evitar o corte de linhas do PostgREST. SECURITY INVOKER → RLS do imbalance vale.
create or replace function public.get_book_pressure_windows(p_asset text)
returns table(label text, bid numeric, ask numeric)
language sql stable security invoker set search_path = public as $$
  with r as (
    select ts, bid_wide_usd, ask_wide_usd
    from public.orderbook_imbalance
    where asset = p_asset and ts > now() - interval '48 hours'
  )
  select w.label,
         coalesce(sum(r.bid_wide_usd) filter (where r.ts > now() - w.ival), 0)::numeric,
         coalesce(sum(r.ask_wide_usd) filter (where r.ts > now() - w.ival), 0)::numeric
  from (values ('48h', interval '48 hours'), ('12h', interval '12 hours'), ('30m', interval '30 minutes')) as w(label, ival)
  left join r on true
  group by w.label, w.ival
  order by w.ival desc;
$$;
revoke all on function public.get_book_pressure_windows(text) from public, anon;
grant execute on function public.get_book_pressure_windows(text) to authenticated;
