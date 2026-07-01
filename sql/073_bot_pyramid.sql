-- 073 — Pirâmide: adicionar à posição quando vem novo sinal na MESMA direção (opcional).
alter table public.bot_config add column if not exists pyramid boolean not null default false;
alter table public.bot_config add column if not exists pyramid_max int not null default 2;   -- máx. de adições por posição
alter table public.bot_positions add column if not exists adds int not null default 0;         -- quantas adições já foram feitas

-- Whitelist do setter (redefine incluindo pyramid/pyramid_max).
create or replace function public.bot_set_config(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.bot_config set
    enabled        = coalesce((p->>'enabled')::boolean, enabled),
    venue          = coalesce(p->>'venue', venue),
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
    pyramid        = coalesce((p->>'pyramid')::boolean, pyramid),
    pyramid_max    = coalesce((p->>'pyramid_max')::int, pyramid_max),
    updated_at     = now()
  where id = 1;
end;
$$;
revoke all on function public.bot_set_config(jsonb) from public, anon;
grant execute on function public.bot_set_config(jsonb) to authenticated;
