-- 116: fase V (07/jul) — FILTRO DE VOLATILIDADE na entrada do robô (prática das plataformas:
-- não entrar em vela de spike/notícia; em SMC = entrada esticada longe da zona de origem).
-- vol_max_atr = K: a última vela FECHADA com range (high−low) > K×ATR200 segura a entrada. 0 = off.
-- Backtest 90d (matriz fase V, sobre v28 vela-fechada + cooldown 60):
--   ETH PF 1,44→1,61 · SOL 4,81→5,35 (ret 40,1%) · BNB 1,26→1,27 · AAVE ~= · BTC neutro
--   (PF 2,19→2,09 mas expR 0,538→0,547 e dd 10,3→10,1 — 2 trades filtrados).
-- (time_stop_bars — sair de posição dormente — REPROVADO: ETH PF 0,32, BNB 0,56 no ts16;
--  o slot liberado re-entra em churn. Knob fica só no backtester.)
alter table public.bot_config
  add column if not exists vol_max_atr numeric not null default 2;
