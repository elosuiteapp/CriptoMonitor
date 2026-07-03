-- 098_bot_confluence.sql
-- MOTOR v17 (confluência decide): pedido do dono 03/jul — "confluência de tudo; deu maioria,
-- o robô avalia e faz a operação". Campos novos do bot_config:
--   conf_min      — nº mínimo de grupos (de 4: Estrutura/Fluxo/Técnico/Sentimento) votando na
--                   direção do setup p/ executar (default 3-de-4; maioria simples = 2).
--   max_zone_atr  — QUALIDADE 1: entrada imbalance só com preço a ≤ X ATR da borda do FVG
--                   (0 = desligado). Mata o "chase esticado" longe da zona de origem.
--   opp_zone_atr  — QUALIDADE 2: bloqueia entrada com FVG/OB oposto fresco a ≤ X ATR à frente
--                   (0 = desligado). Não comprar direto numa oferta fresca (caso ETH 03/jul).
-- flow_veto e ta_gate ficam na tabela como LEGADO (o gate de confluência os substitui no motor).

alter table public.bot_config
  add column if not exists conf_min      int     not null default 3,
  add column if not exists max_zone_atr  numeric not null default 0,
  add column if not exists opp_zone_atr  numeric not null default 0;
