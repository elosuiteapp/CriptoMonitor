-- 121: Robô 2.0 — histórico rolante do saldo de cada bloco + força ponderada, por moeda (pro gráfico).
-- Vira INDICADOR no tempo (série temporal) no gráfico do /admin/robo, com toggle por bloco. O bot-run
-- empurra 1 ponto por ciclo (rolling ~300 pontos ≈ 1 dia no 15m). Formato compacto (tupla por ponto):
-- [tSeg, wforce, estrutura, micro, fluxo, posicionamento, tecnico]  (−100..+100 cada bloco). Preenche daqui p/ frente.
alter table public.bot_positions
  add column if not exists block_hist jsonb not null default '[]'::jsonb;
