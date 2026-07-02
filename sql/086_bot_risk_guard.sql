-- 086 — Blindagem de risco do robô: sizing por RISCO (% do patrimônio) + circuit breakers.
-- • risk_pct: % do patrimônio arriscado por trade (tamanho = risco$ ÷ distância-até-o-stop).
--   A coluna `leverage` deixa de ser "tamanho" e vira o TETO de alavancagem (nunca liquida antes do stop).
-- • daily_loss_pct: para de abrir novas posições se a perda realizada do dia passar disso.
-- • max_positions: máx. de posições simultâneas (novas entradas; flip não conta).
-- • cooldown_min: minutos sem reabrir a MESMA moeda depois de um stop (bot_positions.stopped_at).
-- Deixa o robô sistemático (risco fixo por trade) em vez de alavancagem fixa. Padrões conservadores.

alter table public.bot_config    add column if not exists risk_pct       numeric not null default 1.0;  -- % do patrimônio por trade
alter table public.bot_config    add column if not exists daily_loss_pct numeric not null default 5.0;  -- circuit breaker de perda diária
alter table public.bot_config    add column if not exists max_positions  int     not null default 4;    -- posições simultâneas
alter table public.bot_config    add column if not exists cooldown_min   int     not null default 15;   -- cooldown pós-stop (min)
alter table public.bot_positions add column if not exists stopped_at     timestamptz;                   -- último stop (base do cooldown)

-- Alavancagem passa a ser TETO: baixa de 50x (tamanho fixo) p/ 5x (teto de segurança).
update public.bot_config set leverage = 5 where id = 1 and leverage > 10;

-- Whitelist do setter (adiciona os 4 novos a tudo de 085).
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
    auto_weight    = coalesce((p->>'auto_weight')::boolean, auto_weight),
    trail_on       = coalesce((p->>'trail_on')::boolean, trail_on),
    trail_pct      = coalesce((p->>'trail_pct')::numeric, trail_pct),
    trail_atr_mult = coalesce((p->>'trail_atr_mult')::numeric, trail_atr_mult),
    stop_atr_on    = coalesce((p->>'stop_atr_on')::boolean, stop_atr_on),
    stop_atr_mult  = coalesce((p->>'stop_atr_mult')::numeric, stop_atr_mult),
    risk_pct       = coalesce((p->>'risk_pct')::numeric, risk_pct),
    daily_loss_pct = coalesce((p->>'daily_loss_pct')::numeric, daily_loss_pct),
    max_positions  = coalesce((p->>'max_positions')::int, max_positions),
    cooldown_min   = coalesce((p->>'cooldown_min')::int, cooldown_min),
    updated_at     = now()
  where id = 1;
end;
$$;
revoke all on function public.bot_set_config(jsonb) from public, anon;
grant execute on function public.bot_set_config(jsonb) to authenticated;
