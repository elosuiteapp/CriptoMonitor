-- 128 — FIX (12/jul/2026): lista de newsletter vazia no site, no app E no /admin.
--
-- Causa (mesma classe do gamma 125/126 — grant faltando): newsletter_editions NÃO tinha SELECT
-- para anon NEM para authenticated (só postgres/service_role). Existe até a policy
-- `newsletter_editions_read_published` (published=true, para anon+authenticated), mas RLS e GRANT
-- são camadas separadas: sem o grant, toda leitura direta batia em
-- "permission denied for table newsletter_editions" ANTES da RLS.
--   - web/src/lib/newsletter.ts  listEditions() -> .from('newsletter_editions').select(...)  (direto)
--   - site/src/lib/newsletter.ts listEditions() -> idem (público/anon)
--   - web/src/pages/admin/Newsletter.tsx load()  -> idem (+ WHERE id= no toggle/delete precisa SELECT em id)
-- Resultado: os três caíam em erro engolido -> lista vazia / "Nenhuma edição ainda".
--
-- PAYWALL: o corpo pago (body_md) NÃO pode virar legível direto — ele só sai pela RPC
-- newsletter_full (SECURITY DEFINER, gated por plano; anon nem executa). Por isso o grant é
-- COLUMN-LEVEL em todas as colunas EXCETO body_md. A RLS segue gatekeeper das linhas
-- (published=true p/ não-admin; is_admin() enxerga rascunhos via admin_manage_newsletter).
--
-- Verificado: anon lê as 5 edições publicadas; anon em `select body_md` -> permission denied (paywall ok).

grant select
  (id, slug, title, excerpt, teaser_md, cover_emoji, min_tier, module, published, published_at, auto_generated, created_at, model_used)
  on public.newsletter_editions to anon, authenticated;
