-- 102_bot_session_gate.sql
-- GATE DE SESSÃO (estudo 03/jul, 28 backtests): desempenho por bloco de 3h UTC mostrou padrão
-- consistente — 18-24h UTC negativo em 8/8 janelas (tarde/noite EUA = chop de exaustão),
-- 9-12h e 21-24h em 7/8; lucro concentrado em 0-3h (Ásia) e 6-9h (abertura Europa).
-- Variante S2 (bloquear 9-12h + 18-24h UTC p/ ENTRADAS novas; saídas seguem normais) foi a
-- PRIMEIRA variante da saga a melhorar o agregado das 4 moedas nas DUAS janelas:
--   90d: +10,8% → +15,6% · 180d: −6,5% → +42,1% (BTC PF 0,74→1,36; BNB 0,71→1,00;
--   ETH segue positivo 1,36→1,29; custo fica no SOL 1,13→0,89).
-- block_hours = horas UTC (0-23) em que o robô NÃO abre posição nova nem piramida.
-- Em BRT: bloqueia 6-9h da manhã e 15-21h — o robô opera madrugada/manhã cedo e meio-dia.

alter table public.bot_config
  add column if not exists block_hours jsonb not null default '[]'::jsonb;

update public.bot_config set block_hours = '[9,10,11,18,19,20,21,22,23]'::jsonb where id = 1;
