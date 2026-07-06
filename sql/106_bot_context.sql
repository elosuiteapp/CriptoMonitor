-- 106_bot_context.sql — CONTEXTO do robô (06/jul, casos SOL/BTC/ETH/BNB: robô lia "baixa" com o
-- gráfico rompendo estrutura pra cima; short do SOL no topo). Fase F do backtest (16 runs):
-- "maioria 2-de-3 + bússola 4H" foi a ÚNICA variante acima do baseline no agregado
-- (+0,020 → +0,040 R/trade) e corta o drawdown ~pela metade, operando menos e melhor.
--   • dir_mode 'majority' — direção do setup exige 2 das 3 leituras de estrutura concordando
--     (último evento de swing · interna · swing); era OU (estrutura VELHA vencia a recente).
--     Valores: any (antigo) | majority | internal (interna manda).
--   • htf_gate '4H' — entrada precisa alinhar com a estrutura do TF maior (bússola top-down).
--     Valores: off | 1H | 4H | 1D.
-- Reverter = UPDATE, sem deploy.

alter table public.bot_config
  add column if not exists dir_mode text not null default 'majority',
  add column if not exists htf_gate text not null default '4H';
