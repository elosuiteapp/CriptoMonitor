-- ═══════════════════════════════════════════════════════════════════════════
-- 047_orderbook_imbalance_by_exchange.sql — separa pressão do book por exchange
-- OrbeView
--
-- Passa a guardar uma linha por (asset, exchange): binance = VAREJO, coinbase =
-- INSTITUCIONAL (mesma lógica do prêmio Coinbase / viés institucional × varejo).
-- A UI mostra dois cards: book do varejo (Binance) e do institucional (Coinbase).
-- Dado de snapshot (recoletado a cada ciclo) → limpa as linhas antigas combinadas.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.orderbook_imbalance add column if not exists exchange text not null default 'binance';
alter table public.orderbook_imbalance drop constraint if exists orderbook_imbalance_asset_ts_key;
delete from public.orderbook_imbalance;  -- linhas antigas (combinadas) — recoletado a cada ciclo
create unique index if not exists uq_orderbook_imbalance_axt
  on public.orderbook_imbalance (asset, exchange, ts);
