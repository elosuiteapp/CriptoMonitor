-- 122: Robô 2.0 — TRAVA DE BREAKEVEN (re-adicionada, 10/jul). Depois que o trade fica ≥ conf2_be_atr × ATR
-- no lucro, o stop NUNCA fica abaixo da entrada (long) / acima (short) → um winner não vira loser.
-- O v28 tinha isso; o conf2 largou ao trocar pro stop de catástrofe largo (4×ATR devolvia todo o lucro).
-- conf2_be_atr = distância (×ATR) que ARMA a trava; 0 = desliga. LIÇÃO sql/111: coluna nova = RPC junto.

alter table public.bot_config
  add column if not exists conf2_be_atr numeric not null default 1;

-- RPC v6: whitelist de sql/120 (v5) + conf2_be_atr.
create or replace function public.bot_set_config(p jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
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
    rev_mode       = coalesce(p->>'rev_mode', rev_mode),
    ta_gate        = coalesce((p->>'ta_gate')::boolean, ta_gate),
    flow_veto      = coalesce((p->>'flow_veto')::numeric, flow_veto),
    conf_min        = coalesce((p->>'conf_min')::int, conf_min),
    max_zone_atr    = coalesce((p->>'max_zone_atr')::numeric, max_zone_atr),
    opp_zone_atr    = coalesce((p->>'opp_zone_atr')::numeric, opp_zone_atr),
    target_on       = coalesce((p->>'target_on')::boolean, target_on),
    tp_partial      = coalesce((p->>'tp_partial')::boolean, tp_partial),
    block_hours     = coalesce(p->'block_hours', block_hours),
    asset_overrides = coalesce(p->'asset_overrides', asset_overrides),
    imb_mode        = coalesce(p->>'imb_mode', imb_mode),
    imb_align       = coalesce((p->>'imb_align')::boolean, imb_align),
    setup_priority  = coalesce(p->>'setup_priority', setup_priority),
    zone_once       = coalesce((p->>'zone_once')::boolean, zone_once),
    dir_mode        = coalesce(p->>'dir_mode', dir_mode),
    htf_gate        = coalesce(p->>'htf_gate', htf_gate),
    conf_scope      = coalesce(p->>'conf_scope', conf_scope),
    delta_confirm   = coalesce((p->>'delta_confirm')::boolean, delta_confirm),
    zone_discipline = coalesce((p->>'zone_discipline')::boolean, zone_discipline),
    sq_filter       = coalesce((p->>'sq_filter')::boolean, sq_filter),
    opp_htf_atr     = coalesce((p->>'opp_htf_atr')::numeric, opp_htf_atr),
    vol_max_atr     = coalesce((p->>'vol_max_atr')::numeric, vol_max_atr),
    bot_engine      = coalesce(p->>'bot_engine', bot_engine),
    resident_stop   = coalesce((p->>'resident_stop')::boolean, resident_stop),
    conf2_weights   = coalesce(p->'conf2_weights', conf2_weights),
    conf2_enter     = coalesce((p->>'conf2_enter')::numeric, conf2_enter),
    conf2_hold      = coalesce((p->>'conf2_hold')::numeric, conf2_hold),
    conf2_stop_atr  = coalesce((p->>'conf2_stop_atr')::numeric, conf2_stop_atr),
    conf2_be_atr    = coalesce((p->>'conf2_be_atr')::numeric, conf2_be_atr),
    updated_at      = now()
  where id = 1;
end;
$$;
