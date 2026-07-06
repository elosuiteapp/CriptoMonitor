-- 114_bot_sq_filter.sql — FILTRO SQUEEZE MOMENTUM (LazyBear) no robô (07/jul, pedido do dono).
-- Fase P (90d sobre a v25): melhorou AS 4 moedas — BTC +0,36→+0,46 (PF 2,06) · ETH +0,11→+0,19
-- (PF 1,57, dd 5,4%) · SOL +0,72→+0,95 (PF 3,07, dd 9,2→5,9%) · BNB PF 1,69→1,83; agregado
-- RECORDE +59,9→+67,8R. Regra: momentum (endpoint da linreg do desvio do preço, 20 velas 15m)
-- FORTE contra a direção (≥0,5 ATR) segura a entrada. cfg.sq_filter default true.
alter table public.bot_config add column if not exists sq_filter boolean not null default true;
-- bot_set_config: campo novo na RPC (regra: coluna nova = RPC junto)
