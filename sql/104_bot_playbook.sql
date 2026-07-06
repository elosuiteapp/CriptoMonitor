-- 104_bot_playbook.sql — PLAYBOOK SMC do dono (06/jul), após reavaliação dos 52 trades da semana:
-- 45/52 entradas eram "imbalance" perseguindo o FVG na FORMAÇÃO (chase), 16 delas CONTRA a
-- estrutura 15m (31% de acerto; todas as 8 stopadas cheias vieram daí). O módulo Smart Money
-- trata FVG como ZONA a ser RETESTADA — o robô passa a operar igual ao módulo:
--   • imb_mode 'retest'      — entra quando o preço VOLTA à zona do FVG (não na formação);
--   • imb_align true         — imbalance só A FAVOR da estrutura (fim do short contra alta);
--   • setup_priority 'structure' — reteste de OB/FVG pós-BOS/CHoCH (setup do print) tem prioridade;
--   • zone_once true         — 1 entrada por zona: stopou nela, ela invalidou, não re-entra.
-- Backtest 90d (fase D): melhora BTC/ETH/SOL (~+0,04R cada); BNB neutro/pior (já roda meia-dose).
-- Tudo configurável em bot_config (reverter = update, sem deploy).

alter table public.bot_config
  add column if not exists imb_mode       text    not null default 'retest',
  add column if not exists imb_align      boolean not null default true,
  add column if not exists setup_priority text    not null default 'structure',
  add column if not exists zone_once      boolean not null default true;

-- Memória de zonas já usadas por ativo (cap ~20 no bot-run; jsonb de zoneKeys "setup:time").
alter table public.bot_positions
  add column if not exists used_zones jsonb not null default '[]';
