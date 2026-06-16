-- ═══════════════════════════════════════════════════════════════════════════
-- 023_market_activity.sql — Atividade on-chain no card de liquidez/direção (DefiLlama)
-- Volume de DEX (especulação) e fees/receita (uso real) — totais 24h + variação 7d.
-- Entram no mesmo market_liquidity (market-wide) e no market_snapshot.payload.liquidity.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.market_liquidity
  add column if not exists dex_volume_24h numeric,   -- volume DEX 24h (US$)
  add column if not exists dex_change_7d  numeric,   -- variação 7d do volume DEX (%)
  add column if not exists fees_24h       numeric,   -- fees/receita DeFi 24h (US$)
  add column if not exists fees_change_7d numeric;   -- variação 7d das fees (%)
