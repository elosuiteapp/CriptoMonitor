-- 092 — DISCIPLINA DE SAÍDA/REVERSÃO (validada no backtester 90d + 180d em 02/jul/2026).
-- A matriz mostrou que o maior ralo do esqueleto era o CHURN: ~50% das saídas eram reversão
-- (virar a mão a cada sinal contrário) + trailing 0,5×ATR cortando winner cedo.
-- Com rev OFF + trailing 3×ATR + filtro técnico: BTC PF 0.58→1.09, SOL →1.10, ETH →1.03 (180d).
--
-- • rev_mode: como o robô pode VIRAR A MÃO com posição aberta.
--     'off' (default)  = nunca reverte — posição sai só por stop/alvo/trailing;
--     'imbalance'      = só FVG fresco contra vira a mão;
--     'any'            = comportamento antigo (reverte a cada sinal contrário).
-- • ta_gate: filtro técnico (EMA20×50 + VWAP diário) — setup estrutural NÃO-imbalance só
--     entra alinhado aos dois. Melhorou o PF em TODAS as moedas no 180d.
-- • trail_atr_mult: 0,5 → 3 (só se ainda estiver justo) — o trailing largo deixa o winner
--     respirar; a trava de breakeven (≥1×ATR de lucro) continua protegendo.

alter table public.bot_config add column if not exists rev_mode text    not null default 'off';
alter table public.bot_config add column if not exists ta_gate  boolean not null default true;
update public.bot_config set trail_atr_mult = 3 where id = 1 and trail_atr_mult < 1.5;

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
    rev_mode       = coalesce(p->>'rev_mode', rev_mode),
    ta_gate        = coalesce((p->>'ta_gate')::boolean, ta_gate),
    updated_at     = now()
  where id = 1;
end;
$$;
revoke all on function public.bot_set_config(jsonb) from public, anon;
grant execute on function public.bot_set_config(jsonb) to authenticated;
