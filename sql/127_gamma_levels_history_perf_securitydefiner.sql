-- 127 — FIX DEFINITIVO (12/jul/2026): card "Níveis de gamma no tempo" AINDA quebrado
-- ("Não foi possível carregar o histórico de níveis agora"), MESMO logado e com os grants 125/126.
--
-- CAUSA REAL (não era mais permissão — era PERFORMANCE / timeout):
-- A RPC gamma_levels_history era SECURITY INVOKER, então a RLS de gamma_profile rodava por-linha.
-- A policy chama plan_assets(), ts_within_history(ts), plan_is_advanced(), plan_has_layer('gex').
-- Todas são STABLE, MAS todas têm `SET search_path TO 'public'` (proconfig) — e isso IMPEDE o
-- planner de avaliá-las uma única vez (força save/restore de GUC por chamada). Como cada uma
-- consulta plans/subscriptions, o custo era ~8.000 linhas × N funções = 137k buffers, ~7-12s.
--   - Diagnóstico nos logs do Postgres: "duration: 12431 ms" + enxurrada de
--     "canceling statement due to statement timeout".
--   - authenticated tem statement_timeout=8s (anon=3s) → a query de 7-12s era CANCELADA → o
--     supabase-js recebia erro → o componente caía no estado de erro (card vermelho).
--   - Por isso o teste SQL "funcionava" (como postgres o timeout é alto) mas o navegador não.
--
-- FIX: tornar a RPC SECURITY DEFINER (pula a RLS por-linha) e reproduzir o MESMO gate de plano
-- UMA vez, num CTE `gate AS MATERIALIZED` (a cerca de otimização impede o inlining que traria as
-- funções de volta para o filtro por-linha). `auth.uid() is not null` reproduz o "TO authenticated"
-- da policy (deslogado segue com 0 linhas). ts_within_history foi reproduzido inline
-- (hist_days null → sem limite; senão ts > now() - hist_days), idêntico ao corpo original.
--
-- Semântica preservada (verificado após o fix):
--   anon                    -> 0 linhas, sem erro
--   authenticated avançado  -> 700 pontos (30-90d), 54 ms (era 7278 ms; buffers 137186 -> 6981)
--   authenticated free      -> BTC ~24h (history_days=1), ETH = 0 (fora do free)
-- NÃO expõe dado novo: o gate é bit-a-bit o mesmo da RLS, só que avaliado uma vez.

CREATE OR REPLACE FUNCTION public.gamma_levels_history(p_asset text, p_days integer DEFAULT 30)
RETURNS TABLE(ts timestamptz, spot_price double precision, zero_gamma_level double precision,
              call_wall double precision, put_wall double precision, max_pain double precision,
              net_gex_spot double precision, regime text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with gate as materialized (
    select
      ( auth.uid() is not null
        and p_asset = any(plan_assets())
        and (plan_is_advanced() or plan_has_layer('gex')) ) as allowed,
      plan_history_days() as hist_days
  ),
  src as (
    select gp.ts, gp.spot_price, gp.zero_gamma_level, gp.call_wall, gp.put_wall,
           gp.max_pain, gp.net_gex_spot, gp.regime
    from gamma_profile gp
    cross join gate g
    where g.allowed
      and gp.asset = p_asset
      and gp.ts >= now() - make_interval(days => greatest(1, least(p_days, 90)))
      and (g.hist_days is null or gp.ts > now() - make_interval(days => g.hist_days))
  ),
  rng as (select extract(epoch from (max(ts) - min(ts))) as span from src),
  p as (select greatest(300, ceil(coalesce((select span from rng), 0) / 700.0))::int as bsec)
  select distinct on (floor(extract(epoch from s.ts) / (select bsec from p)))
    s.ts,
    s.spot_price::double precision,
    s.zero_gamma_level::double precision,
    s.call_wall::double precision,
    s.put_wall::double precision,
    s.max_pain::double precision,
    s.net_gex_spot::double precision,
    s.regime
  from src s
  order by floor(extract(epoch from s.ts) / (select bsec from p)), s.ts desc;
$function$;

grant execute on function public.gamma_levels_history(text, integer) to anon, authenticated;
