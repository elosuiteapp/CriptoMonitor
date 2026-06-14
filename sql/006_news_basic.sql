-- ═══════════════════════════════════════════════════════════════════════════
-- 006_news_basic.sql — Notícias acessíveis a todos os planos (PRD §8.6.4)
-- O bloco de notícias é Free (últimas 3) / Pro+ (todas). Removemos o gate de
-- métricas avançadas; a janela de histórico por plano (ts_within_history)
-- continua valendo (Free ~1 dia, Pro 30d, Expert completo).
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists news_feed_select on public.news_feed;
create policy news_feed_select on public.news_feed for select to authenticated
using (public.ts_within_history(published_at));
