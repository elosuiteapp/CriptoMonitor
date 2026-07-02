-- 096 — idioma do usuário p/ notificações do servidor (M1 da auditoria de lançamento):
-- sino/toast/push/e-mail eram sempre PT, mesmo p/ usuário usando o app em EN.
-- O front sincroniza profiles.lang (useLocale) ao trocar idioma/logar; market-read e
-- alerts-dispatch leem e geram o texto em PT ou EN. APLICADA em 02/jul/2026.
alter table public.profiles add column if not exists lang text not null default 'pt';
