-- 115: fase R (07/jul) — filtro de ZONA OPOSTA DO HTF na entrada do robô.
-- Caso dos prints do dono (07/jul): ETH 1809/BNB 584/BTC 63769 comprados COLADOS num OB 1H de
-- venda — o 15m não enxerga a zona do TF maior (o 1H só entrava como bússola de direção).
-- opp_htf_atr = X: OB/FVG CONTRÁRIO não-preenchido do TF da bússola (htf_gate) a ≤ X×ATR(HTF)
-- à frente SEGURA a entrada. 0 = desligado.
-- Backtest 90d (matriz fase R, com alvo OFF/só trailing — diretiva do dono 07/jul):
--   BTC PF 1,90→2,18 · ETH 1,22→1,44 · SOL 2,99→4,81 (dd 5,9→4,1%) · BNB neutro (1,19→1,17).
-- (min_rr — exigir alvo estrutural ≥1R pra entrar — REPROVADO: n cai pra ~7 e fica negativo
--  em BTC/ETH/BNB; os runners nascem justamente de setups com o 1º ímã perto.)
alter table public.bot_config
  add column if not exists opp_htf_atr numeric not null default 1;
