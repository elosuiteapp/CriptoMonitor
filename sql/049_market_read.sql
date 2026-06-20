-- ═══════════════════════════════════════════════════════════════════════════
-- 049_market_read.sql — Leitura do Mercado persistida (Fase 2 do motor de confluência)
--
-- A aba "Leitura do Mercado" calcula a leitura NO FRONT (ao vivo). Aqui criamos a
-- camada SERVIDOR: a edge function `market-read` roda o mesmo motor a cada ~30 min,
-- grava o estado aqui, e dispara alerta (notifications) quando o VIÉS VIRA (tone
-- muda bull↔bear↔neutral). Isso destrava: alerta de regime, histórico/track record
-- e o narrador por IA (fases seguintes). Leitura é market-wide (broadcast), Expert-only.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.market_read (
  id            bigserial   primary key,
  asset         text        not null,
  bias          int         not null,           -- -100..+100
  conviction    int         not null,           -- 0..100 (forças alinhadas)
  regime_key    text        not null,
  regime_label  text        not null,
  tone          text        not null,           -- bull | bear | neutral
  char_state    text,                            -- tendência | range | comprimido
  ts            timestamptz not null default now()
);
create index if not exists idx_market_read_asset_ts on public.market_read(asset, ts desc);

alter table public.market_read enable row level security;
-- A aba é Expert-only → leitura persistida também (histórico/track record).
drop policy if exists market_read_select on public.market_read;
create policy market_read_select on public.market_read
  for select to authenticated
  using (public.current_plan_slug() = 'expert');

-- Realtime para um futuro painel de histórico atualizar sozinho (idempotente).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='market_read'
  ) then
    alter publication supabase_realtime add table public.market_read;
  end if;
end $$;
