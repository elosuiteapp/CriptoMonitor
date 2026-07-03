-- 099_bot_target_toggle.sql
-- Pedido do dono (03/jul): "só quero fazer entrada e o stop vai movendo conforme o preço
-- desloca, até fazer saída ou ser stopado. Nada de alvo de ganho."
-- target_on = take-profit estrutural (alvo na próxima liquidez) ligado/desligado.
--   true  = comportamento anterior (alvo + stop + trailing)
--   false = SEM alvo: posição sai só por stop / stop móvel (trailing 4×ATR)
-- Coluna nasce true (semântica do motor até aqui) e o UPDATE aplica a escolha do dono.

alter table public.bot_config
  add column if not exists target_on boolean not null default true;

update public.bot_config set target_on = false where id = 1;
