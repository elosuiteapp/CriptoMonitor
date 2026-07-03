-- 103_bot_asset_overrides.sql
-- CONFIG POR MOEDA (decisão do dono 03/jul): "cada moeda é única para se operar, baseado
-- naquilo que construímos até agora; a linha de aprendizado é individual por moeda e as
-- melhorias são feitas separadamente para cada uma".
-- Motor IDÊNTICO para todas (SMC arma → confluência vota → maioria executa → saídas
-- validadas); o que varia por moeda é a DOSE, via asset_overrides:
--   block_hours — gate de sessão por moeda (sobrepõe o global)
--   conf_min    — grupos mínimos de confluência (sobrepõe o global)
--   risk_mult   — multiplicador do risco por trade (0.1–1)
-- Estado inicial = o que os ~90 backtests desta revisão validaram POR ATIVO (2 janelas):
--   BTC: sessão bloqueada 9-12h+18-24h UTC (PF 0,74→1,36 180d) · risco cheio
--   ETH: LIVRE (sem gates além da confluência — SMC puro é a edge: PF 1,36-1,87)
--   SOL: LIVRE (o gate de sessão o taxava: 1,13→0,89)
--   BNB: sessão bloqueada (0,71→1,00) + MEIO RISCO (pior moeda em tudo; candidato a pausa)
-- Anti-overfit: parâmetro por moeda só muda com melhora nas DUAS janelas (90d+180d) do
-- backtester; o live é validado pelo dataset bot_trades_hist (por moeda).

alter table public.bot_config
  add column if not exists asset_overrides jsonb not null default '{}'::jsonb;

update public.bot_config set asset_overrides = '{
  "BTC": {"block_hours": [9,10,11,18,19,20,21,22,23], "risk_mult": 1},
  "ETH": {"block_hours": [], "risk_mult": 1},
  "SOL": {"block_hours": [], "risk_mult": 1},
  "BNB": {"block_hours": [9,10,11,18,19,20,21,22,23], "risk_mult": 0.5}
}'::jsonb where id = 1;
