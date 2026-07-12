-- 124 — EXPERIMENTO (12/jul/2026): trailing por VELA na sombra do Robô 2.0.
-- Ideia do dono p/ substituir o stop de catástrofe 4×ATR (que a análise de 3 dias acusou:
-- 25 stops, −481 USDT, 0% de acerto — o buraco do 2.0). Nova saída (só em PAPEL por enquanto):
--   entrada  → stop no FUNDO/TOPO da vela de entrada (∓ 0,1×ATR de respiro)
--   2ª vela  → zero a zero (breakeven), só se estiver no lucro
--   2ª→6ª    → segura no zero a zero
--   6ª em diante → segue o fundo (long)/topo (short) de cada nova vela fechada (ratchet)
-- Roda como a 3ª engine `confluence2_ct` no runShadow (MESMAS entradas do conf2 — força ponderada
-- + histerese; só a saída difere) p/ um A/B limpo contra o `confluence2` (catástrofe 4×ATR).
-- NÃO toca no vivo. Regra [[propose-before-changing-bot]]: medir na sombra antes de decidir.

-- Coluna p/ contar velas 15m fechadas desde a entrada (open-time unix seg da vela de decisão).
alter table public.bot_shadow add column if not exists entry_bar bigint;
comment on column public.bot_shadow.entry_bar is 'unix seg (open-time) da vela de decisão na entrada; usado pela variante confluence2_ct p/ contar velas fechadas desde a entrada';
