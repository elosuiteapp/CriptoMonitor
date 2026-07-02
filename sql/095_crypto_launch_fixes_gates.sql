-- 095 — Correções da auditoria de lançamento (lote 1): gates presos em slug legado + higiene.
-- Ver docs/crypto-launch-audit.md. APLICADA em 02/jul/2026.

-- C1: alertas inoperantes nos planos VENDIDOS (mod_crypto/complete sem canal 'inapp';
-- o painel insere channel='inapp' e a RLS alerts_insert exige canal do plano).
update public.plans set alert_channels = array['inapp','email']
where slug in ('mod_crypto', 'complete');

-- A3: histórico da Leitura do Mercado preso no slug legado 'expert' (sql/049).
-- Novo helper por CAPACIDADE (smart_money) — acompanha qualquer plano futuro.
create or replace function public.plan_has_smart_money()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select smart_money from public.plans where slug = public.current_plan_slug()), false);
$$;
revoke all on function public.plan_has_smart_money() from public, anon;
grant execute on function public.plan_has_smart_money() to authenticated;

drop policy if exists market_read_select on public.market_read;
create policy market_read_select on public.market_read
  for select to authenticated
  using (public.plan_has_smart_money());

-- M8: deriva de migração — colunas module existiam só no banco (fora do repo).
alter table public.notifications add column if not exists module text not null default 'crypto';
alter table public.alerts add column if not exists module text not null default 'crypto';

-- M3: colunas Expert (put_call_ratio/avg_iv/iv_skew/avg_*_strike) de gamma_profile eram
-- legíveis pelo Free via REST (RLS é por linha). Privilégio por COLUNA: revoga o SELECT
-- de tabela e concede só as colunas da vitrine/uso real (nenhum código pago lê as
-- sensíveis da tabela — pagos usam market_snapshot.payload). RLS por linha continua valendo.
revoke select on public.gamma_profile from authenticated, anon;
grant select (id, asset, ts, spot_price, zero_gamma_level, regime, max_pain, max_pain_expiry, net_gex_spot, profile_jsonb, call_wall, put_wall)
  on public.gamma_profile to authenticated;
