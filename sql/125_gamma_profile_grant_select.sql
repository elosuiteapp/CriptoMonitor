-- 125 — FIX (12/jul/2026): card "Níveis de gamma no tempo" quebrado
-- ("Não foi possível carregar o histórico de níveis agora").
--
-- Causa: a RPC gamma_levels_history (SECURITY INVOKER) lê de public.gamma_profile, que tem RLS
-- com política de SELECT p/ authenticated (plan-gated: plan_assets + plan_has_layer('gex')). MAS o
-- GRANT de SELECT na tabela nunca foi dado a authenticated → toda chamada logada batia em
-- "permission denied for table gamma_profile". RLS e GRANT são camadas SEPARADAS: a política libera
-- QUAIS linhas; o grant libera o PRIVILÉGIO de ler. As tabelas irmãs do módulo (market_snapshot,
-- options_flow, orderbook_walls, onchain_perps) já tinham o grant — só a gamma_profile ficou de fora.
--
-- Verificado: como service_role (ignora RLS) voltavam 700 linhas; como authenticated dava
-- permission denied. Após o grant, authenticated volta linhas normalmente (RLS segue filtrando por plano).

grant select on public.gamma_profile to authenticated;
