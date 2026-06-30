-- 068 — Cache do on-chain. bitcoin-data.com (fonte do MVRV-Z/SOPR/NUPL/Puell) tem limite de
-- 10 req/HORA no free tier; a edge crypto-onchain fazia 5 chamadas POR ACESSO → estouraria
-- com vários usuários / refresh. Agora a edge serve deste cache e só re-busca a fonte a cada
-- ~6h (e devolve o último dado bom se a fonte limitar). Só o service-role (edge) lê/escreve.
create table if not exists public.crypto_onchain (
  id int primary key default 1,
  data jsonb not null,
  ts timestamptz not null default now(),
  constraint crypto_onchain_singleton check (id = 1)
);
alter table public.crypto_onchain enable row level security;
-- Sem policies: front consome via a edge function (service-role); anon não acessa.
