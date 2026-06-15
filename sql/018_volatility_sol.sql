-- ═══════════════════════════════════════════════════════════════════════════
-- 018_volatility_sol.sql — libera SOL no Volatility Dashboard
-- A tabela `volatility_index` (015) limitava asset a BTC/ETH (DVOL só existe na
-- Deribit). SOL ganha IVP/RV/IV-RV/term structure via IV da Bybit (DVOL fica null).
-- A RLS (plan_is_advanced + plan_assets + ts_within_history) já protege por plano.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.volatility_index drop constraint if exists volatility_index_asset_check;
alter table public.volatility_index
  add constraint volatility_index_asset_check check (asset in ('BTC', 'ETH', 'SOL'));
