-- 107_bot_conf_scope.sql — decisão do dono (06/jul): "robô opera apenas SMC com pressão;
-- o restante fica pra estudo ou confluência básica". O gate de confluência passa a considerar
-- só os grupos ESTRUTURA (SMC 15m) + FLUXO (book inst/varejo — a pressão — + liqs/gamma/CVD div);
-- Técnico e Sentimento continuam CALCULADOS e LOGADOS (aprendizado/estudo), mas fora da decisão.
--   conf_scope: 'smc_flow' (default novo) | 'all' (os 4 grupos, comportamento v17-v20).
-- Com 'smc_flow' o conf_min é limitado a 2 (Estrutura E Fluxo a favor = confluência básica).
-- Reverter = UPDATE, sem deploy.

alter table public.bot_config
  add column if not exists conf_scope text not null default 'smc_flow';
