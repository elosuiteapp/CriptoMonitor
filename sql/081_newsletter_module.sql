-- 081 — Newsletter por MÓDULO: distingue edições de cripto / B3 / forex.
-- (crypto = existente; B3/Forex geradas pela função newsletter-module.)
alter table public.newsletter_editions add column if not exists module text not null default 'crypto';
create index if not exists idx_newsletter_module on public.newsletter_editions (module, published_at desc);
