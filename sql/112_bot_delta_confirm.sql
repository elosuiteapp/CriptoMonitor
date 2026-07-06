-- 112_bot_delta_confirm.sql — CONFIRMAÇÃO DE DELTA POR VELA (ideia do dono, 06/jul noite):
-- a vela da entrada precisa ter delta (volume comprador − vendedor, taker, da própria formação
-- do candle) A FAVOR da direção. Fase K do backtest (90d, config live maioria+bússola 1H):
-- ÚNICA variante da saga a melhorar as 4 moedas — BTC +0,02→+0,29R (PF 1,61), ETH vira positivo,
-- SOL PF 2,24, BNB dd 4,7%; agregado +39,9→+56,1R com R médio 2×. Fonte: klines da Binance
-- (quoteVol + takerBuyQuote); o CVD 3-corretoras (coletor) segue votando via divergência.
alter table public.bot_config add column if not exists delta_confirm boolean not null default true;

-- bot_set_config: aceitar o campo novo (lição da sql/111: coluna nova = RPC junto).
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
    updated_at      = now()
  where id = 1;
end;
$$;
