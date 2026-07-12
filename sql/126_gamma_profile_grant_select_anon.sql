-- 126 — FIX (12/jul/2026): card "Níveis de gamma no tempo" AINDA quebrado após o 125.
-- ("Não foi possível carregar o histórico de níveis agora").
--
-- Causa (a que faltava no 125): o 125 deu SELECT em gamma_profile só para `authenticated`.
-- Mas a RPC gamma_levels_history (SECURITY INVOKER) também roda no papel `anon` quando a chamada
-- sai no caminho deslogado — OU na corrida do carregamento, antes da sessão Supabase hidratar do
-- localStorage e anexar o JWT. Nesse instante o request vai como `anon`, que NÃO tinha o grant →
-- "permission denied for table gamma_profile" ANTES da RLS ser avaliada → o card cai no erro vermelho.
--
-- Todas as tabelas-irmãs da vitrine (market_snapshot, options_flow, orderbook_walls,
-- orderbook_imbalance, onchain_perps) já davam SELECT a `anon`; só a gamma_profile ficou de fora
-- (nem no 125). Por isso as irmãs degradavam limpo (0 linhas) e só a gamma estourava.
--
-- Isto NÃO expõe dado: a policy de SELECT segue `TO authenticated` (plan-gated), então `anon`
-- recebe 0 linhas — exatamente como as irmãs. O grant só troca o CRASH (permission denied) por um
-- retorno vazio gracioso; o usuário logado continua vendo os dados (RLS filtra por plano).
--
-- Verificado após o grant: anon → 0 linhas SEM erro; authenticated (user real) → 288 linhas.

grant select on public.gamma_profile to anon;
