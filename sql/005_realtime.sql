-- ═══════════════════════════════════════════════════════════════════════════
-- 005_realtime.sql — Habilita Supabase Realtime nas tabelas que o dashboard
-- assina (PRD §4 — "sem polling"). Idempotente.
--
-- O Realtime respeita as policies RLS (003): cada usuário só recebe eventos das
-- linhas que pode ler.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  t text;
begin
  foreach t in array array['market_snapshot', 'prices_cex', 'sentiment'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
