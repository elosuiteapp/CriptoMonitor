-- ═══════════════════════════════════════════════════════════════════════════
-- 011_gamma_sentiment.sql — Put/Call ratio, IV média e skew (PRD3 Tier 2)
-- Calculados do mesmo book de opções da Deribit (zero fonte nova). Colunas extras
-- em gamma_profile → fluem para o market_snapshot e para o painel Gamma (Pro+).
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.gamma_profile add column if not exists put_call_ratio numeric;
alter table public.gamma_profile add column if not exists avg_iv         numeric;  -- %
alter table public.gamma_profile add column if not exists iv_skew        numeric;  -- IV(puts) − IV(calls), %
