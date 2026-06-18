-- ═══════════════════════════════════════════════════════════════════════════
-- 037_affiliates_rls_deny.sql — Política RLS explícita de "deny-all" para clientes
-- em affiliates/commissions. Crypto Monitor.
--
-- Contexto: 030_affiliates.sql habilitou RLS nessas tabelas SEM policies de
-- propósito (deny implícito) — todo acesso passa por funções SECURITY DEFINER
-- (admin, com is_admin()) ou pelo service_role (webhook), ambos fora do alcance da
-- RLS. O linter do Supabase marca isso como "rls_enabled_no_policy" (INFO).
--
-- Esta migration torna a intenção EXPLÍCITA com uma policy deny-all para anon/
-- authenticated. NÃO altera comportamento (service_role e definer continuam
-- ignorando RLS); apenas documenta a regra no esquema e silencia o advisor.
-- ═══════════════════════════════════════════════════════════════════════════

create policy "affiliates_no_client_access" on public.affiliates
  for all to authenticated, anon
  using (false) with check (false);

create policy "commissions_no_client_access" on public.commissions
  for all to authenticated, anon
  using (false) with check (false);
