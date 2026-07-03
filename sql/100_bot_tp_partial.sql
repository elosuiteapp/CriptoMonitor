-- 100_bot_tp_partial.sql
-- TAKE-PROFIT PARCIAL (motor v17): no alvo de liquidez, o robô embolsa METADE da posição e
-- deixa o resto correr no trailing com o stop travado no mínimo em breakeven (parcial 1×;
-- o alvo some depois dele). Meio-termo entre "alvo cheio" (validado, mas limita o runner) e
-- "sem alvo" (REPROVADO 03/jul — pior em 7/8 janelas: devolve o pico da liquidez ao trailing).
-- Nasce FALSE; ligar conforme o veredito do backtester (tp_mode=partial).

alter table public.bot_config
  add column if not exists tp_partial boolean not null default false;
