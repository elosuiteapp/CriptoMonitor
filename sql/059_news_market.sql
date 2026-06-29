-- Notícias por MERCADO — isola o feed de cada módulo (cripto / B3 / forex).
-- Sem a coluna, as notícias gerais de cripto vazariam pro cockpit do B3/Forex.
-- Default 'crypto' preserva todo o histórico atual (era 100% cripto).
alter table public.news_feed add column if not exists market text not null default 'crypto';
create index if not exists idx_news_feed_market_pub on public.news_feed (market, published_at desc);
comment on column public.news_feed.market is 'crypto | b3 | forex — isola as noticias por modulo';
