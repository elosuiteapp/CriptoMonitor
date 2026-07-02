-- 088 — Robô SMC price-action (15m): entradas/stop/alvo ESTRUTURAIS + sinais de fluxo opcionais.
-- • imbalance_on / imbalance_min_pct: override de FVG novo (entra a favor); min = tamanho mínimo do gap (%).
-- • signal_toggles (jsonb {key:bool}): liga/desliga cada sinal de FLUXO que o robô usa (ausente = ligado).
-- • bot_positions.target_px: alvo estrutural (próxima liquidez) — take-profit do trade.
-- O núcleo SMC (OB/FVG/liquidez/EQH-EQL/zonas/BOS-CHoCH, no 15m) é sempre usado; fluxo é confirmação.

alter table public.bot_config    add column if not exists imbalance_on      boolean not null default true;
alter table public.bot_config    add column if not exists imbalance_min_pct numeric not null default 0;
alter table public.bot_config    add column if not exists signal_toggles    jsonb   not null default '{}'::jsonb;
alter table public.bot_positions add column if not exists target_px         numeric;

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
    imbalance_on   = coalesce((p->>'imbalance_on')::boolean, imbalance_on),
    imbalance_min_pct = coalesce((p->>'imbalance_min_pct')::numeric, imbalance_min_pct),
    signal_toggles = coalesce(p->'signal_toggles', signal_toggles),
    updated_at     = now()
  where id = 1;
end;
$$;
revoke all on function public.bot_set_config(jsonb) from public, anon;
grant execute on function public.bot_set_config(jsonb) to authenticated;
