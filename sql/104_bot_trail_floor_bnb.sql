-- 104_bot_trail_floor_bnb.sql
-- PISO DO TRAILING POR MOEDA (asset_overrides.trail_floor) — resposta ao caso BNB 03/jul
-- (preço subiu ~8 pts e o stop móvel ficou preso na entrada): o piso de estrutura usa o último
-- swing GRANDE (len 20 ≈ 5h), que num rally rápido fica horas abaixo da entrada.
-- Matriz 16 backtests (03/jul noite), trail_floor='internal' (piso no swing INTERNO, len 5 ≈ 1h):
--   REPROVADO como regra global — win rate sobe (41-49%) mas corta os winners (ETH PF 1,39→0,97);
--   APROVADO SÓ NO BNB nas duas janelas: 90d PF 0,97→1,15 (+6,3%) · 180d 0,73→1,06 (+3,8%).
-- Aplicado via config por moeda (regra anti-overfit respeitada: melhora nas 2 janelas).
-- bot-run também ganhou o RE-ARME DE ALVO: posição aberta sem take-profit ganha alvo na próxima
-- liquidez da direção do lucro (cura o resíduo da janela "sem alvo" + planos sem R:R na entrada).

update public.bot_config
  set asset_overrides = jsonb_set(asset_overrides, '{BNB,trail_floor}', '"internal"')
  where id = 1;
