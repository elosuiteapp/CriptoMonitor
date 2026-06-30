-- 064 — Robô v3: estratégia de FLUXO & MICROESTRUTURA (sem indicadores técnicos).
-- O robô lê o snapshot do mercado (book, paredes, gamma, funding, CVD, ETF, sentimento)
-- e decide comprar/vender por confluência. Guarda a "leitura" pra mostrar o raciocínio.

alter table public.bot_config add column if not exists buy_threshold   numeric not null default 15; -- viés p/ comprar
alter table public.bot_config add column if not exists sell_threshold  numeric not null default 15; -- viés (negativo) p/ vender
alter table public.bot_config add column if not exists last_bias       numeric;       -- último viés líquido (-100..100)
alter table public.bot_config add column if not exists last_conviction numeric;       -- % das forças no mesmo sentido
alter table public.bot_config add column if not exists last_decision   text;          -- buy | sell | hold | preview
alter table public.bot_config add column if not exists last_reading    jsonb;         -- breakdown dos sinais
alter table public.bot_config add column if not exists last_run        timestamptz;

-- bot_set_config: aceita também os limiares (sensibilidade). last_* é escrito pelo robô (service role).
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
    position       = coalesce(p->>'position', position),
    pos_base_sz    = coalesce((p->>'pos_base_sz')::numeric, pos_base_sz),
    entry_px       = case when p ? 'entry_px' then (p->>'entry_px')::numeric else entry_px end,
    updated_at     = now()
  where id = 1;
end;
$$;
revoke all on function public.bot_set_config(jsonb) from public, anon;
grant execute on function public.bot_set_config(jsonb) to authenticated;
