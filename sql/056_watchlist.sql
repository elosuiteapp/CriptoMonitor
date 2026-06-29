-- ═══════════════════════════════════════════════════════════════════════════
-- 056_watchlist.sql — Moedas FAVORITAS do usuário (watchlist)
-- Usada p/ personalizar os alertas de "mudança de leitura" (market-read): em vez
-- de transmitir as ~100 moedas pra todos os Experts, só notifica as favoritas de
-- cada um (fallback: quem não favoritou nada recebe as majors BTC/ETH/SOL).
-- Cada usuário gerencia só as próprias linhas (RLS por auth.uid()).
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.watchlist (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  asset      text        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, asset)
);
create index if not exists idx_watchlist_asset on public.watchlist (asset);

grant select, insert, delete on public.watchlist to authenticated;
alter table public.watchlist enable row level security;

drop policy if exists watchlist_select on public.watchlist;
create policy watchlist_select on public.watchlist for select to authenticated
  using (user_id = auth.uid());

drop policy if exists watchlist_insert on public.watchlist;
create policy watchlist_insert on public.watchlist for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists watchlist_delete on public.watchlist;
create policy watchlist_delete on public.watchlist for delete to authenticated
  using (user_id = auth.uid());
