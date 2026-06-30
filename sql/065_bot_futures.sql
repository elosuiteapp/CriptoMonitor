-- 065 — Robô em FUTUROS (OKX perp BTC-USDT-SWAP) — opera long E short com alavancagem.
-- O cérebro (confluência por TF + fluxo) é o mesmo; muda só a execução: agora abre
-- LONG no viés de alta e SHORT no viés de baixa. Posição passa a ter 3 estados.

alter table public.bot_config add column if not exists leverage numeric not null default 3;
alter table public.bot_config add column if not exists mgn_mode text not null default 'cross';

-- Troca o par pra o perpétuo e zera a posição (estava em spot).
update public.bot_config set inst_id = 'BTC-USDT-SWAP', base_ccy = 'BTC', quote_ccy = 'USDT', position = 'flat', pos_base_sz = 0, entry_px = null where id = 1;

create or replace function public.bot_set_config(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.bot_config set
    enabled        = coalesce((p->>'enabled')::boolean, enabled),
    inst_id        = coalesce(p->>'inst_id', inst_id),
    base_ccy       = coalesce(p->>'base_ccy', base_ccy),
    quote_ccy      = coalesce(p->>'quote_ccy', quote_ccy),
    bar            = coalesce(p->>'bar', bar),
    ema_fast       = coalesce((p->>'ema_fast')::int, ema_fast),
    ema_slow       = coalesce((p->>'ema_slow')::int, ema_slow),
    order_quote_sz = coalesce((p->>'order_quote_sz')::numeric, order_quote_sz),
    buy_threshold  = coalesce((p->>'buy_threshold')::numeric, buy_threshold),
    sell_threshold = coalesce((p->>'sell_threshold')::numeric, sell_threshold),
    leverage       = coalesce((p->>'leverage')::numeric, leverage),
    mgn_mode       = coalesce(p->>'mgn_mode', mgn_mode),
    position       = coalesce(p->>'position', position),
    pos_base_sz    = coalesce((p->>'pos_base_sz')::numeric, pos_base_sz),
    entry_px       = case when p ? 'entry_px' then (p->>'entry_px')::numeric else entry_px end,
    updated_at     = now()
  where id = 1;
end;
$$;
revoke all on function public.bot_set_config(jsonb) from public, anon;
grant execute on function public.bot_set_config(jsonb) to authenticated;
