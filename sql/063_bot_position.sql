-- 063 — Robô controla a PRÓPRIA posição (capital em USDT), ignorando saldos pré-existentes.
-- Antes a posição era inferida do saldo da moeda base (o 1 BTC de brinde do demo
-- contava como "comprado"). Agora o robô só vende o que ELE mesmo comprou.

alter table public.bot_config add column if not exists position    text not null default 'flat'; -- flat | long
alter table public.bot_config add column if not exists pos_base_sz numeric not null default 0;     -- BTC que o robô comprou e segura
alter table public.bot_config add column if not exists entry_px    numeric;                        -- preço médio da entrada

-- bot_set_config passa a aceitar também position/pos_base_sz/entry_px (pro admin resetar a posição).
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
    position       = coalesce(p->>'position', position),
    pos_base_sz    = coalesce((p->>'pos_base_sz')::numeric, pos_base_sz),
    entry_px       = case when p ? 'entry_px' then (p->>'entry_px')::numeric else entry_px end,
    updated_at     = now()
  where id = 1;
end;
$$;
revoke all on function public.bot_set_config(jsonb) from public, anon;
grant execute on function public.bot_set_config(jsonb) to authenticated;
