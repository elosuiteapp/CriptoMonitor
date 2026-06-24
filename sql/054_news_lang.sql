-- ═══════════════════════════════════════════════════════════════════════════
-- 054 — Notícias por idioma (i18n)
-- O feed de notícias vinha só de fontes PT-BR. Para o app em inglês, o coletor
-- passa a buscar também feeds de cripto em inglês e marca cada notícia com o
-- idioma da fonte. O front (NewsBlock) filtra pelo idioma selecionado; o link
-- continua abrindo a matéria na fonte original (ver memory [[i18n-plan]]).
-- Linhas existentes são todas PT → default 'pt' está correto.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.news_feed
  add column if not exists lang text not null default 'pt';

-- Índice p/ a consulta do NewsBlock (por idioma + recência).
create index if not exists idx_news_feed_lang_published
  on public.news_feed (lang, published_at desc);
