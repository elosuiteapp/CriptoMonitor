-- 077 — Robô ciente de TENDÊNCIA + gestão de risco.
-- • 5º timeframe (1D) é somado no código do bot-run; o regime (tendência) sai do 4H+1D.
-- • Stop de risco por ciclo: stop_pct (a favor) e ct_stop_pct (contra-tendência, mais curto).
-- • counter_trend: 'block' (só opera a favor) | 'tight' (permite contra com stop curto + tam. menor).
-- • bot_positions guarda o stop_px (nível de stop calculado na abertura) e ctrend (foi contra-tendência).

alter table public.bot_config    add column if not exists stop_pct      numeric not null default 1.5;   -- stop de risco (%) a favor da tendência
alter table public.bot_config    add column if not exists ct_stop_pct   numeric not null default 0.6;   -- stop curto (%) p/ entradas contra-tendência
alter table public.bot_config    add column if not exists counter_trend text    not null default 'tight'; -- 'block' | 'tight'
alter table public.bot_positions add column if not exists stop_px       numeric;                        -- nível de stop da posição aberta
alter table public.bot_positions add column if not exists ctrend        boolean not null default false; -- posição aberta contra a tendência (stop curto)

-- Whitelist do setter (redefine incluindo os novos campos + os já existentes de 076).
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
    min_votes      = coalesce((p->>'min_votes')::int, min_votes),
    stop_pct       = coalesce((p->>'stop_pct')::numeric, stop_pct),
    ct_stop_pct    = coalesce((p->>'ct_stop_pct')::numeric, ct_stop_pct),
    counter_trend  = coalesce(p->>'counter_trend', counter_trend),
    updated_at     = now()
  where id = 1;
end;
$$;
revoke all on function public.bot_set_config(jsonb) from public, anon;
grant execute on function public.bot_set_config(jsonb) to authenticated;
